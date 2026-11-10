import { isRecallConversation, TABLE_CONVERSATION } from '../../src/shared/play/conversations';
import { PLAY_NUDGE_COOLDOWN_MS, PLAY_NUDGE_MAX_AGE_MS, PLAY_NUDGE_MAX_ATTEMPTS } from '../../src/shared/play/nudges';
import type { PlayNudge } from '../../src/shared/play/nudges';
import type { TableRoster } from '../../src/shared/play/schema';

export type NudgeOccupant = { seat: string; userId: string; name: string };

/** Exact names only; collisions across player and faction labels make the request ambiguous. */
export function nudgeTarget(
  text: string,
  fromFactionId: string,
  peerId: string,
  roster: TableRoster,
  occupants: NudgeOccupant[]
) {
  if (isRecallConversation(peerId)) {
    return;
  }
  let name = text.trim();
  if (/^\/nudge\s+/i.test(name)) {
    name = name.replace(/^\/nudge\s+/i, '').trim();
  }
  if (name.startsWith('@')) {
    name = name.slice(1);
  }
  name = name.toLowerCase();
  if (!name) {
    return;
  }
  const matches = roster.seats.flatMap((seat) => {
    const occupant = occupants.find((entry) => entry.seat === seat.id);
    if (!seat.faction || !occupant) {
      return [];
    }
    if (seat.faction.name.toLowerCase() !== name && occupant.name.toLowerCase() !== name) {
      return [];
    }
    return [{ ...occupant, factionId: seat.faction.id }];
  });
  if (matches.length !== 1) {
    return;
  }
  const target = matches[0];
  if (target.factionId === fromFactionId || (peerId !== TABLE_CONVERSATION && peerId !== target.factionId)) {
    return;
  }
  return target;
}

type PendingRow = { data: string; attempts: number; retry_at: number; expires_at: number };

/** One pending event and one durable cooldown per target seat; callers stage inside the chat transaction. */
export class NudgeOutbox {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec('CREATE TABLE IF NOT EXISTS nudge_cooldowns (seat TEXT PRIMARY KEY, until_at INTEGER NOT NULL)');
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS nudge_outbox (seat TEXT PRIMARY KEY, nudge_id TEXT NOT NULL, data TEXT NOT NULL, attempts INTEGER NOT NULL, retry_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)'
    );
  }
  stage(nudge: PlayNudge) {
    this.prune(nudge.at);
    const cooldown = this.storage.sql
      .exec<{ until_at: number }>('SELECT until_at FROM nudge_cooldowns WHERE seat=?', nudge.toSeat)
      .toArray()[0];
    if (cooldown && cooldown.until_at > nudge.at) {
      return false;
    }
    this.storage.sql.exec(
      'INSERT INTO nudge_cooldowns VALUES (?, ?) ON CONFLICT(seat) DO UPDATE SET until_at=excluded.until_at',
      nudge.toSeat,
      nudge.at + PLAY_NUDGE_COOLDOWN_MS
    );
    this.storage.sql.exec(
      'INSERT INTO nudge_outbox VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(seat) DO UPDATE SET nudge_id=excluded.nudge_id, data=excluded.data, attempts=0, retry_at=excluded.retry_at, expires_at=excluded.expires_at',
      nudge.toSeat,
      nudge.nudgeId,
      JSON.stringify(nudge),
      nudge.at,
      nudge.at + PLAY_NUDGE_MAX_AGE_MS
    );
    return true;
  }
  private prune(now: number) {
    this.storage.sql.exec('DELETE FROM nudge_outbox WHERE expires_at<=? OR attempts>=?', now, PLAY_NUDGE_MAX_ATTEMPTS);
  }
  pending(now = Date.now()): { nudge: PlayNudge; attempts: number; retryAt: number } | undefined {
    const row = this.storage.sql
      .exec<PendingRow>('SELECT data,attempts,retry_at,expires_at FROM nudge_outbox ORDER BY retry_at, seat LIMIT 1')
      .toArray()[0];
    if (!row) {
      return;
    }
    if (row.expires_at <= now || row.attempts >= PLAY_NUDGE_MAX_ATTEMPTS) {
      this.prune(now);
      return this.pending(now);
    }
    return { nudge: JSON.parse(row.data) as PlayNudge, attempts: row.attempts, retryAt: row.retry_at };
  }
  acknowledge(nudgeId: string) {
    this.storage.sql.exec('DELETE FROM nudge_outbox WHERE nudge_id=?', nudgeId);
  }
  reserve(nudgeId: string, retryAt: number) {
    this.storage.sql.exec('UPDATE nudge_outbox SET retry_at=MIN(expires_at, ?) WHERE nudge_id=?', retryAt, nudgeId);
  }
  defer(nudgeId: string, retryAt: number) {
    this.storage.sql.exec('UPDATE nudge_outbox SET attempts=attempts+1, retry_at=? WHERE nudge_id=?', retryAt, nudgeId);
  }
  scrub(userId: string) {
    this.storage.sql.exec("DELETE FROM nudge_outbox WHERE json_extract(data, '$.toUserId')=?", userId);
  }
}
