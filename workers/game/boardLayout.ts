import type { TablePiece, Vector3Tuple } from '../../src/shared/play/model';
import { BOARD_RADIUS, TABLE_VISIBLE_RADIUS, restingPositionAt } from '../../src/shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import { PLAYER_RING_RADIUS } from '../../src/shared/play/tableSettings';
import { applyPatch, diff } from './history';
import type { Patch } from './history';
import type { HistoryRow } from './sessionHistory';
import type { StoredSnapshot } from './state';
import { storedSnapshotSchema } from './state';

/*
 * The board shrank (board radius 4.25 to 3.98, seat ring 4.69 to 4.39) so troop reserves clear the card wells.
 * A game stored before that moves onto the smaller board: pieces on the board move in with it, keeping their territory,
 * and everything set out at a seat moves straight in with the seat ring, keeping its spacing from the faction token.
 * The card wells, shelves and trackers beyond the round table's edge stay where they are.
 */
const LEGACY_BOARD_RADIUS = 4.25;
const LEGACY_BOARD_RIM_RADIUS = 4.52;
const LEGACY_PLAYER_RING_RADIUS = 4.69;
const BOARD_SCALE = BOARD_RADIUS / LEGACY_BOARD_RADIUS;
const RING_SHIFT = LEGACY_PLAYER_RING_RADIUS - PLAYER_RING_RADIUS;

/** Where a point on the old layout's table lies on the current one, or null beyond the round table, where nothing moved. */
function movedPoint([x, y, z]: Vector3Tuple): Vector3Tuple | null {
  const radius = Math.hypot(x, z);
  if (radius > TABLE_VISIBLE_RADIUS) {
    return null;
  }
  const scale = radius <= LEGACY_BOARD_RIM_RADIUS ? BOARD_SCALE : (radius - RING_SHIFT) / radius;
  return [x * scale, y, z * scale];
}

/** A snapshot laid out for the old, larger board, with every piece on the round table moved onto the current one. */
export function moveOntoCurrentBoard(snapshot: StoredSnapshot): StoredSnapshot {
  const anchor = snapshot.battleState && movedPoint(snapshot.battleState.anchor);
  const pieces = snapshot.table.pieces.map((piece) => {
    const moved = movedPoint(piece.position);
    return moved ? { ...piece, position: moved } : piece;
  });
  const movedIds = new Set(
    pieces.filter((piece, index) => piece !== snapshot.table.pieces[index]).map((piece) => piece.id)
  );
  /*
   * Footprints keep their size while the board shrinks, so pieces set side by side can come to overlap; each moved piece
   * takes the nearest clear place among the others, as a drop would, and rests on whatever lies under it.
   */
  for (const [index, piece] of pieces.entries()) {
    if (!movedIds.has(piece.id)) {
      continue;
    }
    const others = pieces.filter((other) => other !== piece) as TablePiece[];
    const clear = nearestCollisionFreePosition(piece as TablePiece, piece.position, others) ?? piece.position;
    pieces[index] = { ...piece, position: restingPositionAt(clear, piece) };
  }
  return {
    ...snapshot,
    table: { ...snapshot.table, pieces },
    battleState: snapshot.battleState && anchor ? { ...snapshot.battleState, anchor } : snapshot.battleState,
  };
}

/** Whether a snapshot as read from storage was laid out for the current board. */
function onCurrentLayout(stored: unknown): boolean {
  return Boolean(stored && typeof stored === 'object' && 'boardLayout' in stored);
}

/** A stored snapshot as read from storage, moved onto the current board when it was laid out for the old one. */
export function onCurrentBoard(stored: unknown): unknown {
  if (onCurrentLayout(stored)) {
    return stored;
  }
  const parsed = storedSnapshotSchema.safeParse(stored);
  return parsed.success ? moveOntoCurrentBoard(parsed.data) : stored;
}

/*
 * Moves a stored game laid out for the old board onto the current one, once, with its whole playback history:
 * every step is replayed as restore replays it, moved, and stored again, so playback and the live table agree.
 * The rewritten current state carries the layout stamp, so a room moved once never moves again.
 */
export function moveStoredGameOntoCurrentBoard(storage: DurableObjectStorage) {
  const current = storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').toArray()[0];
  const stored = current && (JSON.parse(current.data) as unknown);
  if (!current || onCurrentLayout(stored)) {
    return;
  }
  storage.transactionSync(() => {
    let legacy: StoredSnapshot | undefined;
    let moved: StoredSnapshot | undefined;
    for (const row of storage.sql.exec<HistoryRow>('SELECT * FROM history ORDER BY step').toArray()) {
      const data = JSON.parse(row.data) as unknown;
      const checkpoint = row.kind === 'checkpoint';
      legacy = storedSnapshotSchema.parse(checkpoint ? data : applyPatch(legacy!, data as Patch[]));
      const next = moveOntoCurrentBoard(legacy);
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
      JSON.stringify(moveOntoCurrentBoard(storedSnapshotSchema.parse(stored)))
    );
  });
}
