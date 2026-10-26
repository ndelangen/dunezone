import type { TablePiece, Vector3Tuple } from '../../src/shared/play/model';
import { SHARED_ITEM_PLACEMENT_ANCHORS, placementAnchorForPose } from '../../src/shared/play/tableFurnitureLayout';
import { BOARD_RADIUS, TABLE_VISIBLE_RADIUS, restingPositionAt } from '../../src/shared/play/tableGeometry';
import { isCollisionFreePosition, nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import { PLAYER_RING_RADIUS } from '../../src/shared/play/tableSettings';
import type { StoredSnapshot } from './state';
import { BOARD_LAYOUT, storedSnapshotSchema } from './state';

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

/** The layout stamp before parsing adds the current schema's default. */
function storedLayout(stored: unknown): unknown {
  return stored && typeof stored === 'object' && 'boardLayout' in stored ? stored.boardLayout : undefined;
}

function isFormerSharedWellCard(piece: StoredSnapshot['table']['pieces'][number]): boolean {
  if (piece.kind !== 'card' || piece.inventory) {
    return false;
  }
  const epsilon = 1e-6;
  if (Math.abs(piece.position[0]) > epsilon || Math.abs(piece.position[2] - 7.5) > epsilon) {
    return false;
  }
  return Math.abs(Math.atan2(Math.sin(piece.orientation), Math.cos(piece.orientation))) <= epsilon;
}

/* Only a card parked in the former shared well moves; player-arranged pieces keep their places. */
function moveFormerSharedWell(snapshot: StoredSnapshot): StoredSnapshot {
  const pieces = [...snapshot.table.pieces];
  for (const [index, piece] of pieces.entries()) {
    if (!isFormerSharedWellCard(piece)) {
      continue;
    }
    const others = pieces.filter((other) => other.id !== piece.id && !other.inventory) as TablePiece[];
    const anchor = SHARED_ITEM_PLACEMENT_ANCHORS.find((slot) =>
      isCollisionFreePosition(piece as TablePiece, slot.position, others)
    );
    if (anchor) {
      pieces[index] = { ...piece, position: restingPositionAt(anchor.position, piece) };
    }
  }
  return { ...snapshot, table: { ...snapshot.table, pieces } };
}

/* Move occupied wells from the bottom row first, leaving player-arranged pieces and blocked destinations alone. */
function moveSharedWells(snapshot: StoredSnapshot): StoredSnapshot {
  const pieces = [...snapshot.table.pieces];
  const parked = pieces
    .map((piece, index) => ({ piece, index }))
    .filter(({ piece }) => !piece.inventory)
    .sort((left, right) => right.piece.position[2] - left.piece.position[2]);
  for (const { piece, index } of parked) {
    const destination: Vector3Tuple = [piece.position[0], piece.position[1], piece.position[2] + 1.2];
    const anchor = placementAnchorForPose(piece, destination);
    if (!anchor?.id.startsWith('shared-item-')) {
      continue;
    }
    const others = pieces.filter((other) => other.id !== piece.id && !other.inventory) as TablePiece[];
    if (isCollisionFreePosition(piece as TablePiece, anchor.position, others)) {
      pieces[index] = { ...piece, position: restingPositionAt(anchor.position, piece) };
    }
  }
  return { ...snapshot, table: { ...snapshot.table, pieces } };
}

/** A stored snapshot read on the current board and shelf layout. */
export function onCurrentBoard(stored: unknown): unknown {
  const layout = storedLayout(stored);
  if (layout === BOARD_LAYOUT) {
    return stored;
  }
  if (layout !== undefined && layout !== 2 && layout !== 3) {
    return stored;
  }
  const parsed = storedSnapshotSchema.safeParse(
    stored && typeof stored === 'object' ? { ...stored, boardLayout: BOARD_LAYOUT } : stored
  );
  if (!parsed.success) {
    return stored;
  }
  if (layout === 3) {
    return moveSharedWells(parsed.data);
  }
  return moveFormerSharedWell(layout === undefined ? moveOntoCurrentBoard(parsed.data) : parsed.data);
}
