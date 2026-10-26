import type { Viewer } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';

/*
 * The slice of a Durable Object's SQL storage that the game Worker's seating, seat requests and trading run on, held in memory,
 * so a tutorial table runs the Worker's own `ActorDirectory`, `Participation` and `Swapping` instead of a copy of their rules.
 * Each statement those classes send is answered here by its exact text. A statement this does not know throws, so a change to
 * the Worker's SQL fails the tutorial's tests instead of being quietly skipped.
 * The audit and history tables keep nothing: the tutorial shows no log of them.
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
  /* Every seat a seat history row would name, so a retired drafting place is never renumbered. */
  private readonly historySeats = new Set<string>();

  constructor(actors: MemoryActor[], seats: MemorySeat[]) {
    this.actors = actors;
    this.seats = seats;
  }

  private readonly live = () => this.actors.filter((actor) => actor.deleted === 0);
  private readonly seated = () => this.live().filter((actor) => actor.seat !== SPECTATOR_SEAT);

  private readonly statements: Record<string, (...args: never[]) => unknown[]> = {
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
    'INSERT INTO seats (seat, position) VALUES(?,?)': (seat: string, position: number) => {
      this.seats.push({ seat, position, faction_id: null, faction_name: null, faction_color: null });
      return [];
    },
    'DELETE FROM seats WHERE seat=?': (seat: string) => {
      this.seats.splice(
        this.seats.findIndex((row) => row.seat === seat),
        1
      );
      this.historySeats.add(seat);
      return [];
    },
    'SELECT seat FROM seats UNION SELECT seat FROM seat_history': () =>
      [...new Set([...this.seats.map((row) => row.seat), ...this.historySeats])].map((seat) => ({ seat })),
    'SELECT * FROM seats ORDER BY position': () => [...this.seats].sort((a, b) => a.position - b.position),
    'INSERT INTO seat_history(user_id,display_name,seat,event,created_at,cause,approver_id,approver_name,event_id) VALUES(?,?,?,?,?,?,?,?,?)':
      (_userId: string, _name: string, seat: string) => {
        this.historySeats.add(seat);
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
  };

  exec<Row = Record<string, unknown>>(query: string, ...args: unknown[]): Cursor<Row> {
    if (/^(CREATE TABLE IF NOT EXISTS|INSERT INTO swap_audit)/.test(query)) {
      return cursor([]);
    }
    const statement = this.statements[query];
    if (!statement) {
      throw new Error(`A tutorial table does not run this statement: ${query}`);
    }
    return cursor((statement as (...values: unknown[]) => Row[])(...args));
  }

  /** The storage object the Worker's classes take, answering only `sql` and its synchronous transactions. */
  storage(): DurableObjectStorage {
    return { sql: this, transactionSync: <T>(closure: () => T) => closure() } as unknown as DurableObjectStorage;
  }
}
