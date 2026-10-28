import type { Viewer } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';

import type { HistoryRow } from '../../../../../../workers/game/sessionHistory';

/*
 * The slice of a Durable Object's SQL storage that the game Worker's seating, seat requests and trading run on, held in memory,
 * so a tutorial table runs the Worker's own `ActorDirectory`, `Participation` and `Swapping` instead of a copy of their rules.
 * Each statement those classes send is answered here by its exact text. A statement this does not know throws, so a change to
 * the Worker's SQL fails the tutorial's tests instead of being quietly skipped.
 * Removal votes are kept as the Worker keeps them, so a tutorial vote opens, counts and ends by the Worker's own rules.
 * Review votes, checkpoints and public log rows use the same producers as multiplayer.
 */

export type MemoryActor = {
  user_id: string;
  seat: Viewer['viewerSeat'];
  display_name: string;
  deleted: number;
  avatar_url: string | null;
  profile_slug: string | null;
};
export type MemorySeat = {
  seat: string;
  position: number;
  faction_id: string | null;
  faction_name: string | null;
  faction_color: string | null;
};
type SeatRequestRow = {
  request_id: string;
  user_id: string | null;
  display_name: string;
  seat: string | null;
  state: 'pending' | 'approved' | 'withdrawn' | 'closed';
  created_at: number;
  resolved_at: number | null;
  approver_id: string | null;
  approver_name: string | null;
};

type SeatHistoryRow = { user_id: string | null; seat: string; event: 'joined' | 'vacated' };

type RemovalVoteRow = {
  sequence: number;
  vote_id: string;
  data: string;
  result: string | null;
  resolved_at: number | null;
  phase: number;
  context: string;
};

type Cursor<Row> = { toArray(): Row[]; one(): Row; [Symbol.iterator](): IterableIterator<Row> };
const cursor = <Row>(rows: Row[]): Cursor<Row> => ({
  toArray: () => rows,
  [Symbol.iterator]: () => rows[Symbol.iterator](),
  one: () => {
    if (rows.length !== 1) {
      throw new Error(`Expected exactly one row, found ${rows.length}.`);
    }
    return rows[0]!;
  },
});

const bySeat = (a: { seat: string }, b: { seat: string }) => (a.seat < b.seat ? -1 : a.seat > b.seat ? 1 : 0);

export class MemorySql {
  readonly actors: MemoryActor[];
  readonly seats: MemorySeat[];
  readonly seatRequests: SeatRequestRow[] = [];
  readonly removalVotes: RemovalVoteRow[] = [];
  private readonly reviews: { review_id: string; data: string; result: string | null }[] = [];
  private readonly history: Omit<HistoryRow, 'place'>[] = [];
  private readonly clocks: { step: number; recorded_at: number }[] = [];
  private readonly places: { step: number; place: string }[] = [];
  private readonly log: {
    sequence: number;
    key: string;
    class: string;
    template: string;
    people: string;
    context: string;
    created_at: number;
  }[] = [];
  logOffset = 0;
  /** Who joined or left which seat, in order, as the seat history table keeps it. */
  readonly seatHistory: SeatHistoryRow[] = [];
  /* Every seat a seat history row would name, so a retired drafting place is never renumbered. */
  private readonly historySeats = new Set<string>();

  constructor(actors: MemoryActor[], seats: MemorySeat[]) {
    this.actors = actors;
    this.seats = seats;
  }

  private readonly live = () => this.actors.filter((actor) => actor.deleted === 0);
  private readonly seated = () => this.live().filter((actor) => actor.seat !== SPECTATOR_SEAT);

  private readonly statements: Record<string, (...args: never[]) => unknown[]> = {
    'INSERT INTO table_reviews(review_id,data) VALUES(?,?)': (review_id: string, data: string) => {
      this.reviews.push({ review_id, data, result: null });
      return [];
    },
    'SELECT data FROM table_reviews WHERE result IS NULL ORDER BY sequence DESC LIMIT 1': () =>
      this.reviews.filter((row) => row.result === null).slice(-1),
    'UPDATE table_reviews SET data=? WHERE review_id=?': (data: string, id: string) => {
      Object.assign(
        this.reviews.find((row) => row.review_id === id)!,
        { data }
      );
      return [];
    },
    'UPDATE table_reviews SET data=?, result=?, resolved_at=? WHERE review_id=?': (
      data: string,
      result: string,
      _at: number,
      id: string
    ) => {
      Object.assign(
        this.reviews.find((row) => row.review_id === id)!,
        { data, result }
      );
      return [];
    },
    'INSERT INTO history VALUES(?,?,?,?,?,?,?)': (
      step: number,
      base_revision: number,
      revision: number,
      phase: number,
      kind: string,
      data: string,
      bytes: number
    ) => {
      this.history.push({ step, base_revision, revision, phase, kind, data, bytes });
      return [];
    },
    'INSERT INTO history_clocks VALUES(?,?)': (step: number, recorded_at: number) => {
      this.clocks.push({ step, recorded_at });
      return [];
    },
    'INSERT INTO history_places VALUES(?,?)': (step: number, place: string) => {
      this.places.push({ step, place });
      return [];
    },
    'SELECT step, place FROM history_places ORDER BY step DESC LIMIT ?': (limit: number) =>
      this.places.slice(-limit).reverse(),
    'SELECT recorded_at FROM history_clocks WHERE step=?': (step: number) =>
      this.clocks.filter((row) => row.step === step),
    "SELECT * FROM history WHERE kind='checkpoint' AND step<=? ORDER BY step DESC LIMIT 1": (step: number) =>
      this.history.filter((row) => row.kind === 'checkpoint' && row.step <= step).slice(-1),
    'SELECT * FROM history WHERE step>? AND step<=? ORDER BY step': (after: number, step: number) =>
      this.history.filter((row) => row.step > after && row.step <= step),
    'SELECT actors.deleted FROM spawn_requests JOIN actors ON actors.user_id=spawn_requests.user_id WHERE spawn_requests.request_id=?':
      () => [],
    'SELECT actors.deleted FROM seat_requests JOIN actors ON actors.user_id=seat_requests.user_id WHERE seat_requests.request_id=?':
      () => [],
    'SELECT data FROM spice_transfers WHERE revision=?': () => [],
    'INSERT OR IGNORE INTO public_log(key,class,template,people,context,created_at) VALUES(?,?,?,?,?,?)': (
      key: string,
      kind: string,
      template: string,
      people: string,
      context: string,
      created_at: number
    ) => {
      if (!this.log.some((row) => row.key === key)) {
        this.log.push({
          sequence: this.logOffset + this.log.length + 1,
          key,
          class: kind,
          template,
          people,
          context,
          created_at,
        });
      }
      return [];
    },
    'SELECT * FROM actors WHERE seat=? AND deleted=0': (seat: string) =>
      this.live().filter((actor) => actor.seat === seat),
    'SELECT * FROM actors WHERE user_id=? AND deleted=0': (userId: string) =>
      this.live().filter((actor) => actor.user_id === userId),
    'UPDATE actors SET seat=? WHERE user_id=?': (seat: string, userId: string) => {
      for (const actor of this.actors.filter((candidate) => candidate.user_id === userId)) {
        actor.seat = seat;
      }
      return [];
    },
    'SELECT seat, user_id FROM actors WHERE deleted=0 AND seat!=? ORDER BY seat': () =>
      this.seated()
        .sort(bySeat)
        .map(({ seat, user_id }) => ({ seat, user_id })),
    'SELECT seat, display_name, avatar_url, profile_slug FROM actors WHERE deleted=0 AND seat!=? ORDER BY seat': () =>
      this.seated()
        .sort(bySeat)
        .map(({ seat, display_name, avatar_url, profile_slug }) => ({ seat, display_name, avatar_url, profile_slug })),
    'SELECT seat FROM actors WHERE deleted=0 AND seat!=?': () => this.seated().map(({ seat }) => ({ seat })),
    'SELECT seat, user_id, display_name FROM actors WHERE deleted=0 AND seat!=? ORDER BY seat': () =>
      this.seated()
        .sort(bySeat)
        .map(({ seat, user_id, display_name }) => ({ seat, user_id, display_name })),
    'INSERT INTO seats (seat, position) VALUES(?,?)': (seat: string, position: number) => {
      this.seats.push({ seat, position, faction_id: null, faction_name: null, faction_color: null });
      return [];
    },
    'DELETE FROM seats WHERE seat=?': (seat: string) => {
      const index = this.seats.findIndex((row) => row.seat === seat);
      if (index !== -1) {
        this.seats.splice(index, 1);
      }
      this.historySeats.add(seat);
      return [];
    },
    'SELECT seat FROM seats UNION SELECT seat FROM seat_history': () =>
      [...new Set([...this.seats.map((row) => row.seat), ...this.historySeats])].map((seat) => ({ seat })),
    'SELECT * FROM seats ORDER BY position': () => [...this.seats].sort((a, b) => a.position - b.position),
    'INSERT INTO seat_history(user_id,display_name,seat,event,created_at,cause,approver_id,approver_name,event_id) VALUES(?,?,?,?,?,?,?,?,?)':
      (userId: string | null, _name: string, seat: string, event: SeatHistoryRow['event']) => {
        this.historySeats.add(seat);
        this.seatHistory.push({ user_id: userId, seat, event });
        return [];
      },
    "SELECT request_id FROM seat_requests WHERE user_id=? AND state='pending'": (userId: string) =>
      this.seatRequests
        .filter((row) => row.user_id === userId && row.state === 'pending')
        .map(({ request_id }) => ({ request_id })),
    "INSERT INTO seat_requests (request_id, user_id, display_name, seat, state, created_at) VALUES(?,?,?,?,'pending',?)":
      (requestId: string, userId: string, displayName: string, seat: string | null, now: number) => {
        this.seatRequests.push({
          request_id: requestId,
          user_id: userId,
          display_name: displayName,
          seat,
          state: 'pending',
          created_at: now,
          resolved_at: null,
          approver_id: null,
          approver_name: null,
        });
        return [];
      },
    "SELECT * FROM seat_requests WHERE request_id=? AND state='pending'": (requestId: string) =>
      this.seatRequests.filter((row) => row.request_id === requestId && row.state === 'pending'),
    "UPDATE seat_requests SET state='approved', resolved_at=?, approver_id=?, approver_name=? WHERE request_id=?": (
      now: number,
      approverId: string,
      approverName: string,
      requestId: string
    ) => {
      for (const row of this.seatRequests.filter((candidate) => candidate.request_id === requestId)) {
        Object.assign(row, {
          state: 'approved',
          resolved_at: now,
          approver_id: approverId,
          approver_name: approverName,
        });
      }
      return [];
    },
    "UPDATE seat_requests SET state=?, resolved_at=? WHERE request_id=? AND state='pending'": (
      state: SeatRequestRow['state'],
      now: number,
      requestId: string
    ) => {
      for (const row of this.seatRequests.filter(
        (candidate) => candidate.request_id === requestId && candidate.state === 'pending'
      )) {
        Object.assign(row, { state, resolved_at: now });
      }
      return [];
    },
    "UPDATE seat_requests SET state='closed', resolved_at=? WHERE state='pending' AND seat IS NULL": (now: number) => {
      for (const row of this.seatRequests.filter((candidate) => candidate.state === 'pending' && !candidate.seat)) {
        Object.assign(row, { state: 'closed', resolved_at: now });
      }
      return [];
    },
    'INSERT INTO removal_votes(vote_id,data,phase,context) VALUES(?,?,?,?)': (
      voteId: string,
      data: string,
      phase: number,
      context: string
    ) => {
      this.removalVotes.push({
        sequence: this.removalVotes.length + 1,
        vote_id: voteId,
        data,
        result: null,
        resolved_at: null,
        phase,
        context,
      });
      return [];
    },
    'SELECT * FROM removal_votes WHERE vote_id=? AND result IS NULL': (voteId: string) =>
      this.removalVotes.filter((row) => row.vote_id === voteId && row.result === null),
    'SELECT data FROM removal_votes WHERE result IS NULL ORDER BY sequence': () =>
      this.removalVotes.filter((row) => row.result === null).map(({ data }) => ({ data })),
    'UPDATE removal_votes SET data=? WHERE vote_id=?': (data: string, voteId: string) => {
      for (const row of this.removalVotes.filter((candidate) => candidate.vote_id === voteId)) {
        row.data = data;
      }
      return [];
    },
    'UPDATE removal_votes SET data=?, result=?, resolved_at=?, phase=?, context=? WHERE vote_id=?': (
      data: string,
      result: string,
      resolvedAt: number,
      phase: number,
      context: string,
      voteId: string
    ) => {
      for (const row of this.removalVotes.filter((candidate) => candidate.vote_id === voteId)) {
        Object.assign(row, { data, result, resolved_at: resolvedAt, phase, context });
      }
      return [];
    },
  };

  exec<Row = Record<string, unknown>>(query: string, ...args: unknown[]): Cursor<Row> {
    if (/^(CREATE TABLE IF NOT EXISTS|INSERT INTO swap_audit)/.test(query)) {
      return cursor([]);
    }
    if (
      /^SELECT sequence, class, template, people, context, created_at FROM public_log WHERE class IN \([?,]+\) AND sequence<\? ORDER BY sequence DESC LIMIT \?$/.test(
        query
      )
    ) {
      const classes = args.slice(0, -2);
      const before = args.at(-2) as number;
      const limit = args.at(-1) as number;
      return cursor(
        this.log
          .filter((row) => classes.includes(row.class) && row.sequence < before)
          .reverse()
          .slice(0, limit)
          .map((row) => ({ ...row })) as Row[]
      );
    }
    const statement = this.statements[query];
    if (!statement) {
      throw new Error(`A tutorial table does not run this statement: ${query}`);
    }
    /* Rows leave as copies, as SQLite returns them, so a caller that changes a row it read changes nothing stored. */
    return cursor((statement as (...values: unknown[]) => Row[])(...args).map((row) => ({ ...row })));
  }

  /** The storage object the Worker's classes take, answering only `sql` and its synchronous transactions. */
  storage(): DurableObjectStorage {
    return { sql: this, transactionSync: <T>(closure: () => T) => closure() } as unknown as DurableObjectStorage;
  }
}
