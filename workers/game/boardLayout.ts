import { onCurrentBoard, storedLayout } from './boardLayoutSnapshot';
import { applyPatch, diff } from './history';
import type { Patch } from './history';
import type { HistoryRow } from './sessionHistory';
import type { StoredSnapshot } from './state';
import { BOARD_LAYOUT, storedSnapshotSchema } from './state';

/*
 * Moves a stored game's earlier layout onto the current one, once, with its whole playback history:
 * every step is replayed as restore replays it, moved, and stored again, so playback and the live table agree.
 * The rewritten current state carries the layout stamp, so a room moved once never moves again.
 */
export function moveStoredGameOntoCurrentBoard(storage: DurableObjectStorage) {
  const current = storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').toArray()[0];
  const stored = current && (JSON.parse(current.data) as unknown);
  if (!current || storedLayout(stored) === BOARD_LAYOUT) {
    return;
  }
  storage.transactionSync(() => {
    let legacy: StoredSnapshot | undefined;
    let moved: StoredSnapshot | undefined;
    for (const row of storage.sql.exec<HistoryRow>('SELECT * FROM history ORDER BY step').toArray()) {
      const data = JSON.parse(row.data) as unknown;
      const checkpoint = row.kind === 'checkpoint';
      legacy = (checkpoint ? data : applyPatch(legacy!, data as Patch[])) as StoredSnapshot;
      const next = storedSnapshotSchema.parse(onCurrentBoard(legacy));
      const rewritten = JSON.stringify(checkpoint ? next : diff(moved!, next));
      storage.sql.exec(
        'UPDATE history SET data=?, bytes=? WHERE step=?',
        rewritten,
        new TextEncoder().encode(rewritten).byteLength,
        row.step
      );
      moved = next;
    }
    storage.sql.exec(
      'UPDATE current_state SET data=? WHERE id=1',
      JSON.stringify(storedSnapshotSchema.parse(onCurrentBoard(stored)))
    );
  });
}
