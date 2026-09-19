import { PLAY_AUTHORIZATION_BATCH_SIZE } from '../../src/shared/play/admission';
import type { GameSnapshot, Viewer } from '../../src/shared/play/protocol';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { TableRoster } from '../../src/shared/play/schema';
import { anonymizeHistory } from './anonymizeHistory';

type Actor = { user_id: string; seat: Viewer['viewerSeat']; display_name: string; deleted: number };
type Seat = {
  seat: string;
  position: number;
  faction_id: string | null;
  faction_name: string | null;
  faction_color: string | null;
};
type HistoryRow = {
  user_id: string | null;
  display_name: string;
  seat: string;
  event: 'joined' | 'vacated';
  approver_name: string | null;
  event_id: string | null;
};
/** How a player arrived or left; the log distinguishes them, no free text is asked for. */
type SeatCause = 'creation' | 'admission' | 'departure' | 'deletion';
type SeatChange = { cause: SeatCause; eventId?: string; approver?: { userId: string; displayName: string } };
export const SPECTATOR_COLOR = '#d0c8b9';
/** A seat without a faction, and a faction row stored without a colour, take the table's default. */
export const DEFAULT_SEAT_COLOR = '#75d8a7';

export class ActorDirectory {
  /* Requests are scrubbed with the actor that filed them; the room attaches its request ledger once both exist. */
  participation?: { scrubNames(userId: string): void };
  constructor(private readonly storage: DurableObjectStorage) {}

  /** The seating a game fixed. Rows arrive once, at provisioning or at public assignment. */
  install(roster: TableRoster) {
    for (const seat of roster.seats) {
      this.storage.sql.exec(
        'INSERT INTO seats (seat, position, faction_id, faction_name, faction_color) VALUES(?,?,?,?,?)',
        seat.id,
        seat.position,
        seat.faction?.id ?? null,
        seat.faction?.name ?? null,
        seat.faction?.color ?? null
      );
    }
  }

  /** A drafting roster grows by one seat when an admission is approved. */
  addSeat(seat: string, position: number) {
    this.storage.sql.exec('INSERT INTO seats (seat, position) VALUES(?,?)', seat, position);
  }

  /** A drafting place leaves with its player; a fixed seat never does. */
  removeSeat(seat: string) {
    this.storage.sql.exec('DELETE FROM seats WHERE seat=?', seat);
  }

  /** The highest number a real game ever gave a seat, so a retired drafting place is never renumbered. */
  highestSeatNumber(): number {
    return this.storage.sql
      .exec<{ seat: string }>('SELECT seat FROM seats UNION SELECT seat FROM seat_history')
      .toArray()
      .reduce((highest, row) => Math.max(highest, Number(/^seat-(\d+)$/.exec(row.seat)?.[1] ?? 0)), 0);
  }

  /** The player holding a seat now, if anyone; a deleted account holds nothing. */
  holderOf(seat: string): { userId: string; displayName: string } | undefined {
    const row = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE seat=? AND deleted=0', seat).toArray()[0];
    return row && { userId: row.user_id, displayName: row.display_name };
  }

  /** An approved requester takes the seat; the history says who let them in. */
  assign(userId: string, seat: string, change: SeatChange) {
    const actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=? AND deleted=0', userId).one();
    this.storage.sql.exec('UPDATE actors SET seat=? WHERE user_id=?', seat, userId);
    this.record(userId, actor.display_name, seat, 'joined', change);
  }

  /** A departing player keeps watching as a spectator; their seat stays for a replacement. */
  vacate(userId: string, change: SeatChange) {
    const actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=? AND deleted=0', userId).one();
    this.storage.sql.exec('UPDATE actors SET seat=? WHERE user_id=?', SPECTATOR_SEAT, userId);
    this.record(userId, actor.display_name, actor.seat, 'vacated', change);
  }

  private record(
    userId: string | null,
    displayName: string,
    seat: string,
    event: HistoryRow['event'],
    change: SeatChange
  ) {
    this.storage.sql.exec(
      'INSERT INTO seat_history(user_id,display_name,seat,event,created_at,cause,approver_id,approver_name,event_id) VALUES(?,?,?,?,?,?,?,?,?)',
      userId,
      displayName,
      seat,
      event,
      Date.now(),
      change.cause,
      change.approver?.userId ?? null,
      change.approver?.displayName ?? null,
      change.eventId ?? null
    );
  }

  hasSeats(): boolean {
    return this.storage.sql.exec('SELECT 1 FROM seats LIMIT 1').toArray().length > 0;
  }

  roster(seatCount: TableRoster['seatCount']): TableRoster {
    return {
      seatCount,
      seats: this.storage.sql
        .exec<Seat>('SELECT * FROM seats ORDER BY position')
        .toArray()
        .map((row) => ({
          id: row.seat,
          position: row.position,
          faction:
            row.faction_id === null
              ? null
              : {
                  id: row.faction_id,
                  name: row.faction_name ?? row.faction_id,
                  color: row.faction_color ?? DEFAULT_SEAT_COLOR,
                },
        })),
    };
  }

  scrubDeletedHistory() {
    if (this.storage.sql.exec('SELECT 1 FROM actors WHERE deleted=1 LIMIT 1').toArray().length) {
      this.storage.transactionSync(() => anonymizeHistory(this.storage, null));
    }
  }

  seatFor(userId: string) {
    return this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=? AND deleted=0', userId).toArray()[0]
      ?.seat;
  }

  /** Who holds which seat, for the directory summary; spectators hold none. */
  seated(): { seat: string; userId: string }[] {
    return this.storage.sql
      .exec<{ seat: string; user_id: string }>(
        'SELECT seat, user_id FROM actors WHERE deleted=0 AND seat!=? ORDER BY seat',
        SPECTATOR_SEAT
      )
      .toArray()
      .map((row) => ({ seat: row.seat, userId: row.user_id }));
  }

  seats(): Viewer['viewerSeat'][] {
    return this.storage.sql
      .exec<{ seat: Viewer['viewerSeat'] }>('SELECT seat FROM actors WHERE deleted=0 AND seat!=?', SPECTATOR_SEAT)
      .toArray()
      .map((actor) => actor.seat);
  }

  /** The faction of the seat a user currently holds; a seat without a faction controls no private state. */
  factionFor(userId: string): string | undefined {
    return (
      this.storage.sql
        .exec<{ faction_id: string | null }>(
          'SELECT seats.faction_id FROM seats JOIN actors ON actors.seat=seats.seat WHERE actors.user_id=? AND actors.deleted=0',
          userId
        )
        .toArray()[0]?.faction_id ?? undefined
    );
  }

  batch(cursor: string) {
    return this.storage.sql
      .exec<Actor>(
        'SELECT user_id, seat, display_name, deleted FROM actors WHERE deleted=0 AND user_id>? ORDER BY user_id LIMIT ?',
        cursor,
        PLAY_AUTHORIZATION_BATCH_SIZE
      )
      .toArray();
  }

  delete(userId: string, eventId?: string, vacatedEventId?: string) {
    this.storage.transactionSync(() => {
      this.anonymize(userId, vacatedEventId);
      if (eventId) {
        this.storage.sql.exec('INSERT OR IGNORE INTO deletion_receipts VALUES(?)', eventId);
      }
    });
  }

  private anonymize(userId: string, vacatedEventId?: string) {
    const actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
    if (!actor) {
      return;
    }
    /* Names go first, so the history rewrite rebuilds every seat event from rows that already read `[deleted user]`. */
    this.storage.sql.exec("UPDATE seat_history SET display_name='[deleted user]' WHERE user_id=?", userId);
    this.storage.sql.exec("UPDATE seat_history SET approver_name='[deleted user]' WHERE approver_id=?", userId);
    this.participation?.scrubNames(userId);
    if (!actor.deleted && actor.seat !== SPECTATOR_SEAT) {
      this.record(null, '[deleted user]', actor.seat, 'vacated', { cause: 'deletion', eventId: vacatedEventId });
    }
    anonymizeHistory(this.storage, userId);
    this.storage.sql.exec('UPDATE seat_history SET user_id=NULL WHERE user_id=?', userId);
    this.storage.sql.exec('UPDATE seat_history SET approver_id=NULL WHERE approver_id=?', userId);
    if (actor.deleted) {
      return;
    }
    this.storage.sql.exec(
      "UPDATE actors SET seat=?, display_name='[deleted user]', deleted=1 WHERE user_id=?",
      SPECTATOR_SEAT,
      userId
    );
    this.storage.sql.exec('DELETE FROM receipts WHERE actor_id=?', userId);
    this.storage.sql.exec(
      "UPDATE public_action_history SET receipt_key='deleted:' || rowid, user_id=NULL, display_name='[deleted user]' WHERE user_id=?",
      userId
    );
  }

  /** Deleted actors never regain a public label through an older phase checkpoint. */
  publicSnapshot<Snapshot extends GameSnapshot>(snapshot: Snapshot): Snapshot {
    if (!snapshot.controls) {
      return snapshot;
    }
    return {
      ...snapshot,
      controls: {
        ...snapshot.controls,
        requests: snapshot.controls.requests.map((request) => {
          const filed = this.storage.sql
            .exec<{ deleted: number }>(
              'SELECT actors.deleted FROM spawn_requests JOIN actors ON actors.user_id=spawn_requests.user_id WHERE spawn_requests.request_id=?',
              request.id
            )
            .toArray()[0];
          return filed?.deleted ? { ...request, requesterName: '[deleted user]' } : request;
        }),
        seatRequests: snapshot.controls.seatRequests.map((request) => {
          const filed = this.storage.sql
            .exec<{ deleted: number }>(
              'SELECT actors.deleted FROM seat_requests JOIN actors ON actors.user_id=seat_requests.user_id WHERE seat_requests.request_id=?',
              request.id
            )
            .toArray()[0];
          return filed?.deleted ? { ...request, requesterName: '[deleted user]' } : request;
        }),
      },
    };
  }

  /**
   * The viewer a connection is.
   * A fixture seats a newcomer at its lowest vacant station;
   * a real game seats nobody on admission, since its seats come from creation, requests and approvals, so a newcomer watches.
   */
  viewer(connectionId: string, userId: string, displayName: string, options: { seatNewcomers: boolean }): Viewer {
    let actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
    if (actor?.deleted) {
      throw new Error('Admission refused.');
    }
    if (!actor) {
      actor = this.create(userId, displayName, options.seatNewcomers ? this.availableSeat() : SPECTATOR_SEAT);
    }
    return {
      connectionId,
      userId,
      viewerSeat: actor.seat,
      displayName: actor.display_name,
      color: this.color(actor.seat),
    };
  }

  private color(seat: Viewer['viewerSeat']): string {
    if (seat === SPECTATOR_SEAT) {
      return SPECTATOR_COLOR;
    }
    return (
      this.storage.sql.exec<Seat>('SELECT * FROM seats WHERE seat=?', seat).toArray()[0]?.faction_color ??
      DEFAULT_SEAT_COLOR
    );
  }

  /** The lowest vacant station takes the next admitted user; a full table admits spectators. */
  private availableSeat(): Viewer['viewerSeat'] {
    return (
      this.storage.sql
        .exec<{ seat: string }>(
          'SELECT seat FROM seats WHERE seat NOT IN (SELECT seat FROM actors WHERE deleted=0) ORDER BY position LIMIT 1'
        )
        .toArray()[0]?.seat ?? SPECTATOR_SEAT
    );
  }

  /** The creator takes the first seat at creation, before anyone connects. */
  seatCreator(userId: string, displayName: string, seat: string) {
    this.create(userId, displayName, seat);
  }

  private create(userId: string, displayName: string, seat: Viewer['viewerSeat']): Actor {
    const actor = {
      user_id: userId,
      seat,
      display_name: displayName.slice(0, 160),
      deleted: 0,
    };
    this.storage.transactionSync(() => {
      this.storage.sql.exec('INSERT INTO actors VALUES(?,?,?,0)', actor.user_id, actor.seat, actor.display_name);
      if (seat !== SPECTATOR_SEAT) {
        this.record(actor.user_id, actor.display_name, seat, 'joined', { cause: 'creation' });
      }
    });
    return actor;
  }
}
