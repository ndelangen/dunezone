import { nextSnapshot } from '../../src/shared/play/commands';
import { phaseAt, TABLE_PHASES } from '../../src/shared/play/phases';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { removalThreshold } from '../../src/shared/play/removal';
import type { RemovalAction, RemovalVote, RemovalResult } from '../../src/shared/play/removal';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { setupStep } from '../../src/shared/play/setup';
import type { ActorDirectory } from './actors';
import type { StoredSnapshot } from './state';

type Ballot = RemovalVote['ballots'][number] & { userId: string | null };
type Vote = Omit<RemovalVote, 'target' | 'ballots'> & {
  target: RemovalVote['target'] & { userId: string | null };
  ballots: Ballot[];
};
type VoteRow = {
  sequence: number;
  data: string;
  result: RemovalResult['result'] | null;
  resolved_at: number | null;
  phase: number;
  context: string;
};
type RemovePlayer = (snapshot: StoredSnapshot, userId: string, commandId: string, now: number) => StoredSnapshot;

/** Owns ballots and retained results; its caller owns the transaction and the resulting seat changes. */
export class RemovalVotes {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS removal_votes (sequence INTEGER PRIMARY KEY, vote_id TEXT UNIQUE NOT NULL, data TEXT NOT NULL, result TEXT, resolved_at INTEGER, phase INTEGER NOT NULL, context TEXT NOT NULL)'
    );
  }

  apply(snapshot: StoredSnapshot, viewer: Viewer, action: RemovalAction, now: number): StoredSnapshot {
    if (viewer.viewerSeat === SPECTATOR_SEAT) {
      throw new GameRejection('Only current players in a real game can vote on removal.');
    }
    if (!snapshot.stage || snapshot.stage === 'discarded') {
      throw new GameRejection('Only current players in a real game can vote on removal.');
    }
    if (action.kind === 'removal-start') {
      return this.start(snapshot, viewer, action.seat, now);
    }
    return this.ballot(snapshot, viewer, action);
  }

  private ballot(snapshot: StoredSnapshot, viewer: Viewer, action: Extract<RemovalAction, { kind: 'removal-ballot' }>) {
    const row = this.storage.sql
      .exec<VoteRow>('SELECT * FROM removal_votes WHERE vote_id=? AND result IS NULL', action.voteId)
      .toArray()[0];
    if (!row) {
      throw new GameRejection('That removal vote has ended.');
    }
    const vote: Vote = JSON.parse(row.data);
    const ballot = vote.ballots.find((entry) => entry.userId === viewer.userId);
    if (!ballot || vote.target.userId === viewer.userId) {
      throw new GameRejection('You cannot vote on this removal.');
    }
    if (ballot.choice === action.choice) {
      return snapshot;
    }
    ballot.choice = action.choice;
    this.save(vote);
    return this.changed(snapshot);
  }

  private start(snapshot: StoredSnapshot, viewer: Viewer, seat: string, now: number) {
    const players = this.actors.occupants();
    if (players.length < 3) {
      throw new GameRejection('Removal requires at least three players.');
    }
    const target = players.find((player) => player.seat === seat);
    if (!target || target.userId === viewer.userId) {
      throw new GameRejection('Choose another current player.');
    }
    if (this.open().some((vote) => vote.target.userId === target.userId)) {
      return snapshot;
    }
    const vote: Vote = {
      id: `removal-${snapshot.revision + 1}`,
      target,
      openedAt: now,
      threshold: removalThreshold(players.length),
      ballots: players
        .filter((player) => player.userId !== target.userId)
        .map((player) => ({ ...player, choice: player.userId === viewer.userId ? 'remove' : null })),
    };
    this.storage.sql.exec(
      'INSERT INTO removal_votes(vote_id,data,phase,context) VALUES(?,?,?,?)',
      vote.id,
      JSON.stringify(vote),
      snapshot.phase,
      voteContext(snapshot)
    );
    return this.changed(snapshot);
  }

  /** Membership is re-read after each removal, so concurrent targets share one electorate. */
  reconcile(snapshot: StoredSnapshot, now: number, remove: RemovePlayer): StoredSnapshot {
    let next = snapshot;
    let removed: boolean;
    do {
      removed = false;
      for (const vote of this.open()) {
        const players = this.actors.occupants();
        const target = players.find((player) => player.userId === vote.target.userId);
        if (!target) {
          this.finish(vote, 'nullified', next, now);
          next = this.changed(next);
          continue;
        }
        vote.target = target;
        vote.threshold = removalThreshold(players.length);
        vote.ballots = players
          .filter((player) => player.userId !== target.userId)
          .map((player) => ({
            ...player,
            choice: vote.ballots.find((ballot) => ballot.userId === player.userId)?.choice ?? null,
          }));
        this.save(vote);
        const result = voteResult(vote, players.length);
        if (!result) {
          continue;
        }
        this.finish(vote, result, next, now);
        next = this.changed(next);
        if (result === 'removed') {
          next = remove(next, target.userId, vote.id, now);
          removed = true;
          break;
        }
      }
    } while (removed);
    return next;
  }

  current(): RemovalVote[] {
    const players = this.actors.occupants();
    return this.open().map((vote) =>
      publicVote({
        ...vote,
        target: players.find((player) => player.userId === vote.target.userId) ?? vote.target,
        ballots: vote.ballots.map((ballot) => ({
          ...ballot,
          ...players.find((player) => player.userId === ballot.userId),
        })),
      })
    );
  }

  page(before: number) {
    const rows = this.storage.sql
      .exec<VoteRow>(
        'SELECT * FROM removal_votes WHERE result IS NOT NULL AND sequence<? ORDER BY sequence DESC LIMIT 51',
        before
      )
      .toArray();
    return {
      entries: rows.slice(0, 50).map((row) => ({
        ...publicVote(JSON.parse(row.data)),
        sequence: row.sequence,
        result: row.result!,
        resolvedAt: row.resolved_at!,
        phase: row.phase,
        context: row.context,
      })),
      more: rows.length > 50,
    };
  }

  /** Retain every choice and result while removing all identifying data for a deleted account. */
  scrub(userId: string) {
    for (const row of this.storage.sql.exec<VoteRow>('SELECT * FROM removal_votes').toArray()) {
      const vote: Vote = JSON.parse(row.data);
      if (vote.target.userId === userId) {
        vote.target = { ...vote.target, userId: null, name: '[deleted user]' };
      }
      vote.ballots = vote.ballots.map((ballot) =>
        ballot.userId === userId ? { ...ballot, userId: null, name: '[deleted user]' } : ballot
      );
      this.save(vote);
    }
  }

  private open(): Vote[] {
    return this.storage.sql
      .exec<{ data: string }>('SELECT data FROM removal_votes WHERE result IS NULL ORDER BY sequence')
      .toArray()
      .map((row) => JSON.parse(row.data));
  }
  private save(vote: Vote) {
    this.storage.sql.exec('UPDATE removal_votes SET data=? WHERE vote_id=?', JSON.stringify(vote), vote.id);
  }
  private finish(vote: Vote, result: NonNullable<VoteRow['result']>, snapshot: StoredSnapshot, now: number) {
    this.storage.sql.exec(
      'UPDATE removal_votes SET data=?, result=?, resolved_at=?, phase=?, context=? WHERE vote_id=?',
      JSON.stringify(vote),
      result,
      now,
      snapshot.phase,
      voteContext(snapshot),
      vote.id
    );
  }
  private changed(snapshot: StoredSnapshot) {
    return nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT));
  }
}

function publicVote(vote: Vote): RemovalVote {
  return {
    id: vote.id,
    target: { name: vote.target.name, seat: vote.target.seat },
    openedAt: vote.openedAt,
    threshold: vote.threshold,
    ballots: vote.ballots.map(({ name, seat, choice }) => ({ name, seat, choice })),
  };
}

function voteContext(snapshot: StoredSnapshot): string {
  if (snapshot.stage === 'play') {
    return `Turn ${Math.floor(snapshot.phase / TABLE_PHASES.length) + 1}, ${phaseAt(snapshot.phase).label}`;
  }
  if (snapshot.stage === 'setup' && snapshot.setup) {
    return `Setup, ${setupStep(snapshot.setup).title}`;
  }
  return snapshot.stage === 'swapping' ? 'Swapping' : snapshot.stage === 'drafting' ? 'Drafting' : 'Finished';
}

function voteResult(vote: Vote, playerCount: number): Exclude<RemovalResult['result'], 'nullified'> | null {
  const yes = vote.ballots.filter((ballot) => ballot.choice === 'remove').length;
  const uncast = vote.ballots.filter((ballot) => ballot.choice === null).length;
  if (playerCount < 3 || yes + uncast < vote.threshold) {
    return 'failed';
  }
  return yes >= vote.threshold ? 'removed' : null;
}
