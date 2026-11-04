import { accepted, deletedName, nextSnapshot } from '../../src/shared/play/commands';
import { isFlippablePiece } from '../../src/shared/play/model';
import type { StoredPiece } from '../../src/shared/play/model';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { RestoreAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import { DELETED_PIECES_LIMIT } from './state';
import type { StoredSnapshot } from './state';

/**
 * Deleted pieces wait to be restored from the game log (#2132).
 * A deletion is named by the revision that made it, which is also what its game log row is keyed by, so the row can offer Restore for exactly as long as the piece is kept.
 */
export function deletionId(revision: number): string {
  return String(revision);
}

/** The snapshot after a delete command, keeping the piece it took off the table whole so the table can bring it back. */
export function withDeletedPiece(before: StoredSnapshot, next: StoredSnapshot, pieceId: string): StoredSnapshot {
  const piece = before.table.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || next.table.pieces.some((candidate) => candidate.id === pieceId)) {
    return next;
  }
  return {
    ...next,
    deletedPieces: [{ id: deletionId(next.revision), piece }, ...next.deletedPieces].slice(0, DELETED_PIECES_LIMIT),
  };
}

/**
 * Any seated player brings a deleted piece back where it lay, or at the nearest free spot, always face down.
 * Face down, a restored card shows nobody a face they could not see before, whatever it showed when it was deleted.
 * A peek held on the piece before it was deleted does not open it again.
 */
export function restoreCommand(snapshot: StoredSnapshot, action: RestoreAction, actorName: string): StoredSnapshot {
  const deletion = snapshot.deletedPieces.find((entry) => entry.id === action.deletionId);
  if (!deletion) {
    throw new GameRejection('That piece can no longer be restored.');
  }
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  if (table.pieces.some((piece) => piece.id === deletion.piece.id)) {
    throw new GameRejection('That piece is already on the table.');
  }
  const facedDown = faceDown(deletion.piece);
  const free = nearestCollisionFreePosition(facedDown, facedDown.position, table.pieces);
  if (!free) {
    throw new GameRejection(`There is no room on the table to restore ${deletedName(facedDown)}.`);
  }
  /* The search keeps the height it started from, so a piece moved off its old spot rests on whatever lies under its new one. */
  const moved = free[0] !== facedDown.position[0] || free[2] !== facedDown.position[2];
  const restored = { ...facedDown, position: moved ? restingPositionAt(free, facedDown) : free };
  const next = nextSnapshot(
    snapshot,
    accepted(
      { ...table, pieces: [...table.pieces, restored] },
      'piece.restore',
      `${actorName} restored ${deletedName(restored)} to the table, face down.`
    )
  );
  return {
    ...next,
    deletedPieces: snapshot.deletedPieces.filter((entry) => entry !== deletion),
    peeks: Object.fromEntries(Object.entries(snapshot.peeks).filter(([, grant]) => grant.pieceId !== restored.id)),
  };
}

/* Every item turned face down; a piece that cannot be flipped comes back as it was. */
function faceDown(piece: StoredPiece): StoredPiece {
  return isFlippablePiece(piece) ? { ...piece, items: piece.items.map((item) => ({ ...item, faceUp: false })) } : piece;
}
