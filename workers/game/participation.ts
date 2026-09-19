import { nextSnapshot } from '../../src/shared/play/commands';
import { emptyPublicControls } from '../../src/shared/play/inventory';
import type { PublicControls } from '../../src/shared/play/inventory';
import type { TableEvent, TableState } from '../../src/shared/play/model';
import { PLAY_ROSTER_LIMIT, seatLabel } from '../../src/shared/play/participation';
import type { SeatAction, SeatRequest } from '../../src/shared/play/participation';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { Viewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { TableRoster } from '../../src/shared/play/schema';
import { appendEvent, eventId } from '../../src/shared/play/tableState';
import type { ActorDirectory } from './actors';
import type { StoredSnapshot } from './state';

/** A seat in the seating: the player who holds it, or nobody. */
type RequestRow = {
  request_id: string;
  user_id: string | null;
  display_name: string;
  seat: string | null;
  state: 'pending' | 'approved' | 'withdrawn' | 'closed';
  created_at: number;
  resolved_at: number | null;
  approver_id: string | null;
  approver_name: string | null;
  event_id: string;
  resolved_event_id: string | null;
};

/** What the game knows while a seat command is planned: the seating, its fixed count and the minimum the game was created with. */
export type SeatingFacts = { roster: TableRoster; seatCount: TableRoster['seatCount']; minimumPlayers: number };

/** A validated seat command: `apply` runs inside the commit transaction and returns the stored result. */
export type SeatPlan = { apply: () => StoredSnapshot };

/** The one player-facing message for each participation event, rebuilt from its row when a name is scrubbed. */
export const seatMessages = {
  requested: (name: string, seat: string | null) => `${name} asks for ${seat ? seatLabel(seat) : 'a seat'}.`,
  withdrew: (name: string) => `${name} withdrew the seat request.`,
  joined: (name: string, seat: string, approver: string | null) =>
    `${name} takes ${seatLabel(seat)}${approver ? `, approved by ${approver}` : ''}.`,
  vacated: (name: string, seat: string) => `${name} left ${seatLabel(seat)}.`,
  discarded: () => 'The game was discarded: no players remain.',
};

/*
 * Explicit participation for a real game.
 * Requests live in `seat_requests` with who filed them, and in the public controls as every viewer
 * sees them; occupancy changes go through the actor directory and its seat history. Every change
 * here is planned against the current state and applied inside the caller's transaction, so a
 * request, an approval and the seating it changes commit together or not at all.
 */
export class Participation {
  constructor(
    private readonly storage: DurableObjectStorage,
    private readonly actors: ActorDirectory
  ) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS seat_requests (request_id TEXT PRIMARY KEY, user_id TEXT, display_name TEXT NOT NULL, seat TEXT, state TEXT NOT NULL, created_at INTEGER NOT NULL, resolved_at INTEGER, approver_id TEXT, approver_name TEXT, event_id TEXT NOT NULL, resolved_event_id TEXT)'
    );
  }

  /** The request a user has open, if any; only the requester's own view learns which request is theirs. */
  pendingRequestId(userId: string): string | undefined {
    return this.storage.sql
      .exec<{ request_id: string }>("SELECT request_id FROM seat_requests WHERE user_id=? AND state='pending'", userId)
      .toArray()[0]?.request_id;
  }

  plan(viewer: Viewer, action: SeatAction, snapshot: StoredSnapshot, facts: SeatingFacts, now: number): SeatPlan {
    if (snapshot.stage === 'discarded') {
      throw new GameRejection('This game was discarded.');
    }
    if (!snapshot.stage) {
      throw new GameRejection('The fixture seats its players itself.');
    }
    const controls = structuredClone(snapshot.controls ?? emptyPublicControls());
    switch (action.kind) {
      case 'seat-request':
        return this.request(viewer, action.seat, snapshot, controls, facts, now);
      case 'seat-withdraw':
        return this.withdraw(viewer, snapshot, controls, now);
      case 'seat-approve':
        return this.approve(viewer, action.requestId, snapshot, controls, facts, now);
      case 'seat-depart':
        return this.depart(viewer, snapshot, controls, now);
    }
  }

  private request(
    viewer: Viewer,
    seat: string | undefined,
    snapshot: StoredSnapshot,
    controls: PublicControls,
    facts: SeatingFacts,
    now: number
  ): SeatPlan {
    if (viewer.viewerSeat !== SPECTATOR_SEAT) {
      throw new GameRejection('You already hold a seat.');
    }
    if (this.pendingRequestId(viewer.userId)) {
      throw new GameRejection('You already asked for a seat.');
    }
    let target: string | null = null;
    if (snapshot.stage === 'drafting') {
      this.assertRoom(facts);
    } else if (seat === undefined) {
      throw new GameRejection('Choose an open seat.');
    } else {
      this.assertVacant(seat, facts.roster);
      target = seat;
    }
    const requestId = `seat-request-${snapshot.revision + 1}`;
    const event = this.event(snapshot, 'seat-request', seatMessages.requested(viewer.displayName, target));
    return {
      apply: () => {
        this.storage.sql.exec(
          "INSERT INTO seat_requests (request_id, user_id, display_name, seat, state, created_at, event_id) VALUES(?,?,?,?,'pending',?,?)",
          requestId,
          viewer.userId,
          viewer.displayName,
          target,
          now,
          event.id
        );
        controls.seatRequests.push({ id: requestId, requesterName: viewer.displayName, seat: target });
        return this.next(snapshot, controls, event);
      },
    };
  }

  private withdraw(viewer: Viewer, snapshot: StoredSnapshot, controls: PublicControls, now: number): SeatPlan {
    const requestId = this.pendingRequestId(viewer.userId);
    if (!requestId) {
      throw new GameRejection('You have no seat request to withdraw.');
    }
    const event = this.event(snapshot, 'seat-withdraw', seatMessages.withdrew(viewer.displayName));
    return {
      apply: () => {
        this.resolve(requestId, 'withdrawn', now, event.id);
        controls.seatRequests = controls.seatRequests.filter((request) => request.id !== requestId);
        return this.next(snapshot, controls, event);
      },
    };
  }

  private approve(
    viewer: Viewer,
    requestId: string,
    snapshot: StoredSnapshot,
    controls: PublicControls,
    facts: SeatingFacts,
    now: number
  ): SeatPlan {
    if (viewer.viewerSeat === SPECTATOR_SEAT) {
      throw new GameRejection('Only a current player can approve a seat request.');
    }
    const request = this.storage.sql
      .exec<RequestRow>("SELECT * FROM seat_requests WHERE request_id=? AND state='pending'", requestId)
      .toArray()[0];
    if (!request?.user_id || !controls.seatRequests.some((pending) => pending.id === requestId)) {
      throw new GameRejection('That seat request has already been resolved.');
    }
    const requester = request.user_id;
    /* The requester is re-checked when the approval takes effect: still here, still watching. */
    if (this.actors.seatFor(requester) !== SPECTATOR_SEAT) {
      throw new GameRejection('That player already holds a seat.');
    }
    const drafting = snapshot.stage === 'drafting';
    let seat = request.seat;
    let station: { id: string; position: number } | undefined;
    if (drafting) {
      this.assertRoom(facts);
      station = this.newStation(facts);
      seat = station.id;
    } else if (seat === null) {
      throw new GameRejection('That request was for the drafting roster, which has closed.');
    } else {
      this.assertVacant(seat, facts.roster);
    }
    const seated = seat;
    const event = this.event(
      snapshot,
      'seat-approve',
      seatMessages.joined(request.display_name, seated, viewer.displayName)
    );
    return {
      apply: () => {
        if (station) {
          this.actors.addSeat(station.id, station.position);
        }
        this.actors.assign(requester, seated, {
          cause: 'admission',
          approver: { userId: viewer.userId, displayName: viewer.displayName },
          eventId: event.id,
        });
        this.storage.sql.exec(
          "UPDATE seat_requests SET state='approved', resolved_at=?, approver_id=?, approver_name=?, resolved_event_id=? WHERE request_id=?",
          now,
          viewer.userId,
          viewer.displayName,
          event.id,
          requestId
        );
        controls.seatRequests = controls.seatRequests.filter((pending) => pending.id !== requestId);
        return this.next(snapshot, controls, event);
      },
    };
  }

  private depart(viewer: Viewer, snapshot: StoredSnapshot, controls: PublicControls, now: number): SeatPlan {
    if (viewer.viewerSeat === SPECTATOR_SEAT) {
      throw new GameRejection('You hold no seat to leave.');
    }
    const seat = viewer.viewerSeat;
    const event = this.event(snapshot, 'seat-depart', seatMessages.vacated(viewer.displayName, seat));
    return {
      apply: () => {
        this.actors.vacate(viewer.userId, { cause: 'departure', eventId: event.id });
        return this.settle(snapshot, controls, seat, now, event);
      },
    };
  }

  /**
   * Account deletion vacates the seat through the actor directory;
   * this closes the deleted user's request, retires a drafting place and applies the last-player rule, inside the deletion's own transaction.
   */
  afterDeletion(
    userId: string,
    oldSeat: Viewer['viewerSeat'] | undefined,
    snapshot: StoredSnapshot,
    now: number
  ): StoredSnapshot {
    const controls = structuredClone(snapshot.controls ?? emptyPublicControls());
    const requestId = this.pendingRequestId(userId);
    if (requestId) {
      this.resolve(requestId, 'closed', now, null);
      controls.seatRequests = controls.seatRequests.filter((request) => request.id !== requestId);
    }
    if (!oldSeat || oldSeat === SPECTATOR_SEAT || !snapshot.stage) {
      return { ...snapshot, controls };
    }
    /* The directory already wrote the vacated row against this event id. */
    const event = this.event(snapshot, 'seat-depart', seatMessages.vacated('[deleted user]', oldSeat));
    return this.settle(snapshot, controls, oldSeat, now, event);
  }

  /** After a seat empties: a drafting place is retired, and a game with no player left is discarded for good. */
  private settle(
    snapshot: StoredSnapshot,
    controls: PublicControls,
    seat: string,
    now: number,
    event: TableEvent
  ): StoredSnapshot {
    if (snapshot.stage === 'drafting') {
      this.actors.removeSeat(seat);
    }
    controls.ready = controls.ready.filter((ready) => ready !== seat);
    let next = this.next(snapshot, controls, event);
    if (this.actors.seated().length === 0) {
      for (const pending of controls.seatRequests) {
        this.resolve(pending.id, 'closed', now, null);
      }
      controls.seatRequests = [];
      const discarded = this.event(next, 'stage', seatMessages.discarded());
      next = { ...this.next(next, controls, discarded), stage: 'discarded' };
    }
    return next;
  }

  /** Every request row that names a deleted user, so the scrub can rebuild the events they wrote. */
  scrubNames(userId: string) {
    this.storage.sql.exec("UPDATE seat_requests SET display_name='[deleted user]' WHERE user_id=?", userId);
    this.storage.sql.exec("UPDATE seat_requests SET approver_name='[deleted user]' WHERE approver_id=?", userId);
  }

  private resolve(requestId: string, state: RequestRow['state'], now: number, eventId: string | null) {
    this.storage.sql.exec(
      "UPDATE seat_requests SET state=?, resolved_at=?, resolved_event_id=? WHERE request_id=? AND state='pending'",
      state,
      now,
      eventId,
      requestId
    );
  }

  private assertRoom(facts: SeatingFacts) {
    if (this.actors.seated().length >= PLAY_ROSTER_LIMIT || facts.roster.seats.length >= PLAY_ROSTER_LIMIT) {
      throw new GameRejection('This game has no room for another player.');
    }
  }

  private assertVacant(seat: string, roster: TableRoster) {
    if (!roster.seats.some((candidate) => candidate.id === seat)) {
      throw new GameRejection('There is no such seat in this game.');
    }
    if (this.actors.holderOf(seat)) {
      throw new GameRejection('That seat is no longer open.');
    }
  }

  /** A drafting roster grows by one seat at the lowest free station, numbered past every seat the game ever had. */
  private newStation(facts: SeatingFacts): { id: string; position: number } {
    const taken = new Set(facts.roster.seats.map((seat) => seat.position));
    let position = 0;
    while (taken.has(position)) {
      position++;
    }
    return { id: `seat-${this.actors.highestSeatNumber() + 1}`, position };
  }

  private event(snapshot: StoredSnapshot, command: string, message: string): TableEvent {
    return { id: eventId(snapshot.table.nextEventNumber), command, message, status: 'accepted' };
  }

  private next(snapshot: StoredSnapshot, controls: PublicControls, event: TableEvent): StoredSnapshot {
    const table: TableState = tableForViewer(snapshot, SPECTATOR_SEAT);
    const next = nextSnapshot(snapshot, { ...table, ...appendEvent(table, event) });
    return { ...next, controls: { ...controls, seats: this.actors.seats() } };
  }
}

/** The stored seat requests a viewer may act on, with their own one marked. */
export function ownRequests(requests: SeatRequest[], ownId: string | undefined): SeatRequest[] {
  return ownId ? requests.map((request) => (request.id === ownId ? { ...request, own: true } : request)) : requests;
}
