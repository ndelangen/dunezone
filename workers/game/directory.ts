import { playDirectorySummarySchema } from '../../src/shared/play/directory';
import type { PlayDirectorySummary } from '../../src/shared/play/directory';

type OutboxRow = { sequence: number; summary: string; pending: number; attempts: number; retry_at: number };

/*
 * The game's outgoing directory summary.
 * A change to what the lobby may see is staged inside the same transaction as the change itself,
 * with the next sequence; the latest staged summary replaces any older undelivered one. Delivery
 * clears the obligation only for the sequence Convex acknowledged, so an older acknowledgment
 * arriving late never clears newer pending work.
 */
export class DirectoryOutbox {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS directory_outbox (id INTEGER PRIMARY KEY CHECK(id=1), sequence INTEGER NOT NULL, summary TEXT NOT NULL, pending INTEGER NOT NULL, attempts INTEGER NOT NULL, retry_at INTEGER NOT NULL)'
    );
  }

  private row(): OutboxRow | undefined {
    return this.storage.sql.exec<OutboxRow>('SELECT * FROM directory_outbox WHERE id=1').toArray()[0];
  }

  /** Stages a summary when it differs from the last staged one. Call inside the transaction that made the change. */
  stage(summary: PlayDirectorySummary, now: number): boolean {
    const current = this.row();
    const data = JSON.stringify(summary);
    if (current && sameApartFromActivity(current.summary, data) && current.pending) {
      /* Activity alone while a delivery is already owed: the pending summary carries the newer time. */
      this.storage.sql.exec('UPDATE directory_outbox SET summary=? WHERE id=1', data);
      return false;
    }
    if (current?.summary === data) {
      return false;
    }
    const sequence = (current?.sequence ?? 0) + 1;
    if (current) {
      this.storage.sql.exec(
        'UPDATE directory_outbox SET sequence=?, summary=?, pending=1, attempts=0, retry_at=? WHERE id=1',
        sequence,
        data,
        now
      );
    } else {
      this.storage.sql.exec('INSERT INTO directory_outbox VALUES(1,?,?,1,0,?)', sequence, data, now);
    }
    return true;
  }

  /** The summary owed to Convex, or nothing when the directory is current. */
  pending(): { sequence: number; summary: PlayDirectorySummary; attempts: number; retryAt: number } | null {
    const row = this.row();
    if (!row?.pending) {
      return null;
    }
    return {
      sequence: row.sequence,
      summary: playDirectorySummarySchema.parse(JSON.parse(row.summary)),
      attempts: row.attempts,
      retryAt: row.retry_at,
    };
  }

  /** Clears the obligation only when the acknowledged sequence is the one still owed. */
  acknowledge(sequence: number): void {
    this.storage.sql.exec('UPDATE directory_outbox SET pending=0 WHERE id=1 AND sequence=?', sequence);
  }

  /** Records a failed attempt and when to try again. */
  defer(sequence: number, retryAt: number): void {
    this.storage.sql.exec(
      'UPDATE directory_outbox SET attempts=attempts+1, retry_at=? WHERE id=1 AND sequence=? AND pending=1',
      retryAt,
      sequence
    );
  }
}

function sameApartFromActivity(stored: string, next: string): boolean {
  const strip = (data: string) => {
    const { lastActivityAt: _ignored, ...rest } = JSON.parse(data) as PlayDirectorySummary;
    return JSON.stringify(rest);
  };
  return strip(stored) === strip(next);
}
