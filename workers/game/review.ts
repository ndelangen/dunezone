import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { reviewThreshold } from '../../src/shared/play/review';
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
/* Where a review can be asked for: once the seats are dealt and before the game ends. */
const REVIEWABLE_STAGES = new Set<StoredSnapshot['stage']>(['setup', 'play']);

/**
 * Owns the table review: its proposal, ballots, the pause it puts on the table and its Audit rows.
 * Only one review is open at a time; the caller owns the transaction and keeps the table frozen while one runs.
 */
export class TableReviews {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory,
    private readonly log: PublicLog
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS table_reviews (sequence INTEGER PRIMARY KEY, review_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL, result TEXT, resolved_at INTEGER)'
    );
  }

  apply(
    snapshot: StoredSnapshot,
    viewer: Viewer,
    action: ReviewAction,
    now: number,
    checkpoint: (step: number) => string | undefined
  ): StoredSnapshot {
    const players = this.actors.occupants();
    const own = players.find((player) => player.userId === viewer.userId);
    if (!own || !REVIEWABLE_STAGES.has(snapshot.stage)) {
      throw new GameRejection('Only current players can review the table during a game.');
    }
    const open = this.open();
    if (action.kind === 'review-propose') {
      if (open) {
        throw new GameRejection('Another table review is already open.');
      }
      const context = checkpoint(action.step);
      if (context === undefined) {
        throw new GameRejection('That checkpoint cannot be reviewed.');
      }
      const review: Review = {
        id: `review-${snapshot.revision + 1}`,
        step: action.step,
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
      return revised(snapshot);
    }
    if (!open || open.id !== action.reviewId) {
      throw new GameRejection('That table review has ended.');
    }
    if (action.kind === 'review-end') {
      if (open.startedAt === null && open.proposer.userId !== viewer.userId) {
        throw new GameRejection('Only the proposer can withdraw this review.');
      }
      this.finish(open, open.startedAt === null ? 'withdrawn' : 'ended', snapshot, now, own);
      return revised(snapshot);
    }
    if (open.startedAt !== null) {
      throw new GameRejection('The table is already reviewing.');
    }
    const ballot = open.ballots.find((entry) => entry.userId === viewer.userId);
    if (!ballot || ballot.choice === action.choice) {
      return snapshot;
    }
    ballot.choice = action.choice;
    this.save(open);
    return revised(snapshot);
  }

  /**
   * Seats are re-read on every commit, so a player who leaves takes their ballot along and a newcomer gets one.
   * The proposer leaving withdraws the proposal; a review that reaches its majority starts at once.
   */
  reconcile(snapshot: StoredSnapshot, now: number): StoredSnapshot {
    const review = this.open();
    if (!review) {
      return snapshot;
    }
    const players = this.actors.occupants();
    if (!REVIEWABLE_STAGES.has(snapshot.stage) || !players.some((player) => player.userId === review.proposer.userId)) {
      this.finish(review, review.startedAt === null ? 'withdrawn' : 'ended', snapshot, now, null);
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
    const agreed = review.ballots.filter((ballot) => ballot.choice === 'review').length;
    const open = review.ballots.filter((ballot) => ballot.choice === null).length;
    if (agreed >= review.threshold) {
      review.startedAt = now;
      this.save(review);
      this.record(review, 'started', snapshot, now, null);
      return revised(snapshot);
    }
    if (agreed + open < review.threshold) {
      this.finish(review, 'declined', snapshot, now, null);
      return revised(snapshot);
    }
    if (JSON.stringify(review) !== before) {
      this.save(review);
      return revised(snapshot);
    }
    return snapshot;
  }

  current(): TableReview | null {
    const review = this.open();
    return review && publicReview(review);
  }

  /** The review showing now, if the table is paused for one. */
  running(): TableReview | null {
    const review = this.open();
    return review && review.startedAt !== null ? publicReview(review) : null;
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
      this.save(review);
    }
  }

  private open(): Review | null {
    const row = this.storage.sql
      .exec<{ data: string }>('SELECT data FROM table_reviews WHERE result IS NULL ORDER BY sequence DESC LIMIT 1')
      .toArray()[0];
    return row ? JSON.parse(row.data) : null;
  }
  private save(review: Review) {
    this.storage.sql.exec('UPDATE table_reviews SET data=? WHERE review_id=?', JSON.stringify(review), review.id);
  }
  private finish(
    review: Review,
    result: Exclude<ReviewOutcome, 'started'>,
    snapshot: StoredSnapshot,
    now: number,
    by: Person | null
  ) {
    this.storage.sql.exec(
      'UPDATE table_reviews SET data=?, result=?, resolved_at=? WHERE review_id=?',
      JSON.stringify(review),
      result,
      now,
      review.id
    );
    this.record(review, result, snapshot, now, by);
  }
  private record(review: Review, result: ReviewOutcome, snapshot: StoredSnapshot, now: number, by: Person | null) {
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

function publicReview(review: Review): TableReview {
  return {
    ...review,
    proposer: { name: review.proposer.name, seat: review.proposer.seat },
    ballots: review.ballots.map(({ name, seat, choice }) => ({ name, seat, choice })),
  };
}
