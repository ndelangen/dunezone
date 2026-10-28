import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { reviewThreshold, reviewableStage } from '../../src/shared/play/review';
import type { ReviewAction, TableReview } from '../../src/shared/play/review';
import type { ActorDirectory } from './actors';
import { DELETED_USER, logContext } from './log';
import type { PublicLog, ReviewOutcome } from './log';
import { revised } from './state';
import type { StoredSnapshot } from './state';

type Person = { name: string; seat: string; userId: string | null };
type Review = Omit<TableReview, 'proposer' | 'ballots'> & {
  proposer: Person;
  ballots: (TableReview['ballots'][number] & { userId: string | null })[];
};
/** One review action as a player sent it, with the saved checkpoint context a proposal names. */
export type ReviewCommand = {
  snapshot: StoredSnapshot;
  viewer: Viewer;
  action: ReviewAction;
  now: number;
  checkpoint: (step: number) => string | undefined;
};
/** How a review left the table: its result, the table it was recorded at, and who ended it, if anyone did. */
type Outcome = {
  result: ReviewOutcome;
  snapshot: StoredSnapshot;
  now: number;
  by: Person | 'seats' | 'game-ended' | null;
};

/**
 * Owns the table review: its proposal, ballots, the pause it puts on the table and its Audit rows.
 * Only one review is open at a time.
 * The caller owns the transaction and keeps the table frozen while one runs.
 * The open review is cached, and the caller calls `forget()` when a transaction that touched it fails.
 */
export class TableReviews {
  /* The open review as storage holds it, or undefined until it is read. */
  private cached: Review | null | undefined;

  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory,
    private readonly log: PublicLog
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS table_reviews (sequence INTEGER PRIMARY KEY, review_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL, result TEXT, resolved_at INTEGER)'
    );
  }

  apply(command: ReviewCommand): StoredSnapshot {
    const { snapshot, viewer, action } = command;
    const own = this.actors.occupants().find((player) => player.userId === viewer.userId);
    if (!own || !reviewableStage(snapshot.stage)) {
      throw new GameRejection('Only current players can review the table during a game.');
    }
    if (action.kind === 'review-propose') {
      return this.propose(command, action.step, own);
    }
    const open = this.open();
    if (!open || open.id !== action.reviewId) {
      throw new GameRejection('That table review has ended.');
    }
    return action.kind === 'review-end'
      ? this.end(command, open, own)
      : this.ballot(snapshot, open, viewer, action.choice);
  }

  /**
   * Seats are re-read on every commit, so a player who leaves takes their ballot along and a newcomer gets one.
   * The proposer leaving withdraws the proposal, and a review that reaches its majority starts at once.
   */
  reconcile(snapshot: StoredSnapshot, now: number): StoredSnapshot {
    const review = this.open();
    if (!review) {
      return snapshot;
    }
    const players = this.actors.occupants();
    if (!reviewableStage(snapshot.stage) || !players.some((player) => player.userId === review.proposer.userId)) {
      const by = reviewableStage(snapshot.stage) ? 'seats' : 'game-ended';
      this.finish(review, { result: review.startedAt === null ? 'withdrawn' : 'ended', snapshot, now, by });
      return revised(snapshot);
    }
    if (review.startedAt !== null) {
      return snapshot;
    }
    const before = JSON.stringify(review);
    review.threshold = reviewThreshold(players.length);
    review.ballots = players.map((player) => ({
      ...player,
      choice: review.ballots.find((ballot) => ballot.userId === player.userId)?.choice ?? null,
    }));
    const { agreed, open } = count(review);
    if (agreed >= review.threshold) {
      review.startedAt = now;
      this.save(review);
      this.record(review, { result: 'started', snapshot, now, by: null });
      return revised(snapshot);
    }
    if (agreed + open < review.threshold) {
      this.finish(review, { result: 'declined', snapshot, now, by: null });
      return revised(snapshot);
    }
    if (JSON.stringify(review) !== before) {
      this.save(review);
      return revised(snapshot);
    }
    return snapshot;
  }

  current(): TableReview | null {
    const review = this.read();
    return review && publicReview(review);
  }

  /** The review showing now, if the table is paused for one. */
  running(): TableReview | null {
    const review = this.read();
    return review && review.startedAt !== null ? publicReview(review) : null;
  }

  /** Drops the cached open review, so the next read sees what storage kept after a failed transaction. */
  forget() {
    this.cached = undefined;
  }

  /** Retain every choice and result while removing all identifying data for a deleted account. */
  scrub(userId: string) {
    for (const row of this.storage.sql.exec<{ data: string }>('SELECT data FROM table_reviews').toArray()) {
      const review: Review = JSON.parse(row.data);
      if (review.proposer.userId === userId) {
        review.proposer = { ...review.proposer, userId: null, name: DELETED_USER };
      }
      review.ballots = review.ballots.map((ballot) =>
        ballot.userId === userId ? { ...ballot, userId: null, name: DELETED_USER } : ballot
      );
      this.storage.sql.exec('UPDATE table_reviews SET data=? WHERE review_id=?', JSON.stringify(review), review.id);
    }
    this.forget();
  }

  private propose({ snapshot, viewer, now, checkpoint }: ReviewCommand, step: number, own: Person): StoredSnapshot {
    if (this.open()) {
      throw new GameRejection('Another table review is already open.');
    }
    const context = checkpoint(step);
    if (context === undefined) {
      throw new GameRejection('That checkpoint cannot be reviewed.');
    }
    const players = this.actors.occupants();
    const review: Review = {
      id: `review-${snapshot.revision + 1}`,
      step,
      context,
      proposer: own,
      openedAt: now,
      threshold: reviewThreshold(players.length),
      ballots: players.map((player) => ({
        ...player,
        choice: player.userId === viewer.userId ? 'review' : null,
      })),
      startedAt: null,
    };
    this.storage.sql.exec('INSERT INTO table_reviews(review_id,data) VALUES(?,?)', review.id, JSON.stringify(review));
    this.cached = review;
    return revised(snapshot);
  }

  /* The proposer withdraws an open proposal; once the review runs, any seated player resumes play. */
  private end({ snapshot, viewer, now }: ReviewCommand, open: Review, own: Person): StoredSnapshot {
    if (open.startedAt === null && open.proposer.userId !== viewer.userId) {
      throw new GameRejection('Only the proposer can withdraw this review.');
    }
    this.finish(open, { result: open.startedAt === null ? 'withdrawn' : 'ended', snapshot, now, by: own });
    return revised(snapshot);
  }

  private ballot(
    snapshot: StoredSnapshot,
    open: Review,
    viewer: Viewer,
    choice: TableReview['ballots'][number]['choice']
  ): StoredSnapshot {
    if (open.startedAt !== null) {
      throw new GameRejection('The table is already reviewing.');
    }
    const ballot = open.ballots.find((entry) => entry.userId === viewer.userId);
    if (!ballot || ballot.choice === choice) {
      return snapshot;
    }
    ballot.choice = choice;
    this.save(open);
    return revised(snapshot);
  }

  /* The open review to read; `publicReview` copies what it hands out, so reading needs no copy of its own. */
  private read(): Review | null {
    if (this.cached === undefined) {
      this.cached = this.stored();
    }
    return this.cached;
  }
  private open(): Review | null {
    const open = this.read();
    /* Callers change the review they read before saving it, so each gets its own copy. */
    return open && structuredClone(open);
  }
  private stored(): Review | null {
    const row = this.storage.sql
      .exec<{ data: string }>('SELECT data FROM table_reviews WHERE result IS NULL ORDER BY sequence DESC LIMIT 1')
      .toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  private save(review: Review) {
    this.storage.sql.exec('UPDATE table_reviews SET data=? WHERE review_id=?', JSON.stringify(review), review.id);
    this.cached = review;
  }
  private finish(review: Review, outcome: Outcome) {
    this.storage.sql.exec(
      'UPDATE table_reviews SET data=?, result=?, resolved_at=? WHERE review_id=?',
      JSON.stringify(review),
      outcome.result,
      outcome.now,
      review.id
    );
    this.cached = null;
    this.record(review, outcome);
  }
  private record(review: Review, { result, snapshot, now, by }: Outcome) {
    this.log.recordReview({
      id: review.id,
      result,
      checkpoint: review.context,
      proposer: review.proposer,
      ballots: review.ballots,
      by,
      context: logContext(snapshot),
      at: now,
    });
  }
}

function count(review: Review) {
  return {
    agreed: review.ballots.filter((ballot) => ballot.choice === 'review').length,
    open: review.ballots.filter((ballot) => ballot.choice === null).length,
  };
}

function publicReview(review: Review): TableReview {
  return {
    ...review,
    proposer: { name: review.proposer.name, seat: review.proposer.seat },
    ballots: review.ballots.map(({ name, seat, choice }) => ({ name, seat, choice })),
  };
}
