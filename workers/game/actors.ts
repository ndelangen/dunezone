import { PLAY_AUTHORIZATION_BATCH_SIZE } from '../../src/shared/play/admission';
import type { GameSnapshot, Viewer } from '../../src/shared/play/protocol';
import { anonymizeHistory } from './anonymizeHistory';

type Actor = { user_id: string; seat: Viewer['viewerSeat']; display_name: string; deleted: number };
const seatColors: Record<Viewer['viewerSeat'], string> = {
  harkonnen: '#ed927c',
  atreides: '#75d8a7',
  'bene-gesserit': '#d0c8b9',
  shared: '#d0c8b9',
  neutral: '#d0c8b9',
};

export class ActorDirectory {
  constructor(private readonly storage: DurableObjectStorage) {}

  scrubDeletedHistory() {
    if (this.storage.sql.exec('SELECT 1 FROM actors WHERE deleted=1 LIMIT 1').toArray().length) {
      this.storage.transactionSync(() => anonymizeHistory(this.storage, null));
    }
  }

  seatFor(userId: string) {
    return this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=? AND deleted=0', userId).toArray()[0]
      ?.seat;
  }

  seats(): Viewer['viewerSeat'][] {
    return this.storage.sql
      .exec<{ seat: Viewer['viewerSeat'] }>("SELECT seat FROM actors WHERE deleted=0 AND seat!='neutral'")
      .toArray()
      .map((actor) => actor.seat);
  }

  factionFor(userId: string): string | undefined {
    return this.storage.sql
      .exec<{ faction_id: string }>(
        'SELECT faction_id FROM faction_seats JOIN actors ON actors.seat=faction_seats.seat WHERE actors.user_id=? AND actors.deleted=0',
        userId
      )
      .toArray()[0]?.faction_id;
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

  delete(userId: string, eventId?: string) {
    this.storage.transactionSync(() => {
      this.anonymize(userId);
      if (eventId) {
        this.storage.sql.exec('INSERT OR IGNORE INTO deletion_receipts VALUES(?)', eventId);
      }
    });
  }

  private anonymize(userId: string) {
    const actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
    if (!actor) {
      return;
    }
    anonymizeHistory(this.storage, userId);
    if (actor.deleted) {
      return;
    }
    this.storage.sql.exec(
      "UPDATE actors SET seat='neutral', display_name='[deleted user]', deleted=1 WHERE user_id=?",
      userId
    );
    this.storage.sql.exec(
      "UPDATE seat_history SET user_id=NULL, display_name='[deleted user]' WHERE user_id=?",
      userId
    );
    this.storage.sql.exec(
      "INSERT INTO seat_history(user_id,display_name,seat,event,created_at) VALUES(NULL,'[deleted user]',?,'vacated',?)",
      actor.seat,
      Date.now()
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
      },
    };
  }

  viewer(
    connectionId: string,
    userId: string,
    displayName: string,
    seats: readonly string[] = ['harkonnen', 'atreides']
  ): Viewer {
    let actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
    if (actor?.deleted) {
      throw new Error('Admission refused.');
    }
    if (!actor) {
      actor = this.create(userId, displayName, seats);
    }
    return {
      connectionId,
      userId,
      viewerSeat: actor.seat,
      displayName: actor.display_name,
      color: seatColors[actor.seat] ?? '#75d8a7',
    };
  }

  private availableSeat(candidates: readonly string[]): Viewer['viewerSeat'] {
    const occupied = this.storage.sql.exec<Actor>("SELECT * FROM actors WHERE deleted=0 AND seat!='neutral'").toArray();
    const seats = new Set(occupied.map((entry) => entry.seat));
    return candidates.find((candidate) => !seats.has(candidate)) ?? 'neutral';
  }

  private create(userId: string, displayName: string, seats: readonly string[]): Actor {
    const actor = {
      user_id: userId,
      seat: this.availableSeat(seats),
      display_name: displayName.slice(0, 160),
      deleted: 0,
    };
    this.storage.transactionSync(() => {
      this.storage.sql.exec('INSERT INTO actors VALUES(?,?,?,0)', actor.user_id, actor.seat, actor.display_name);
      this.storage.sql.exec(
        "INSERT INTO seat_history(user_id,display_name,seat,event,created_at) VALUES(?,?,?,'joined',?)",
        actor.user_id,
        actor.display_name,
        actor.seat,
        Date.now()
      );
    });
    return actor;
  }
}
