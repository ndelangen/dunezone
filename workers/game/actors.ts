import { PLAY_AUTHORIZATION_BATCH_SIZE } from '../../src/shared/play/admission';
import type { Viewer } from '../../src/shared/play/protocol';

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
    if (!actor || actor.deleted) {
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
  }

  viewer(connectionId: string, userId: string, displayName: string): Viewer {
    let actor = this.storage.sql.exec<Actor>('SELECT * FROM actors WHERE user_id=?', userId).toArray()[0];
    if (actor?.deleted) {
      throw new Error('Admission refused.');
    }
    if (!actor) {
      actor = this.create(userId, displayName);
    }
    return {
      connectionId,
      userId,
      viewerSeat: actor.seat,
      displayName: actor.display_name,
      color: seatColors[actor.seat],
    };
  }

  private availableSeat(): Viewer['viewerSeat'] {
    const occupied = this.storage.sql.exec<Actor>("SELECT * FROM actors WHERE deleted=0 AND seat!='neutral'").toArray();
    const seats = new Set(occupied.map((entry) => entry.seat));
    return (['harkonnen', 'atreides'] as const).find((candidate) => !seats.has(candidate)) ?? 'neutral';
  }

  private create(userId: string, displayName: string): Actor {
    const actor = { user_id: userId, seat: this.availableSeat(), display_name: displayName.slice(0, 160), deleted: 0 };
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
