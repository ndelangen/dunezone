import { accepted, deletedName, nextSnapshot } from '../../src/shared/play/commands';
import { isFlippablePiece, nearestZone } from '../../src/shared/play/model';
import type { StoredPiece, TablePiece, TableState, Vector3Tuple } from '../../src/shared/play/model';
import type { RestoreAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import {
  clampPositionToTable,
  nearestCollisionFreePosition,
  restingAmongLeaders,
} from '../../src/shared/play/tablePhysics';
import {
  keepsInsideTerritory,
  territoryAtTable,
  territoryLanding,
  withNudges,
} from '../../src/shared/play/territoryPlacement';
import type { TerritoryNudge } from '../../src/shared/play/territoryPlacement';
import { DELETED_PIECES_LIMIT } from './state';
import type { StoredSnapshot } from './state';

/**
 * Deleted pieces wait to be restored from the game log (#2132).
 * A deletion is named by the revision that made it, which is also what its game log row is keyed by, so the row can offer Restore for exactly as long as the piece is kept.
 */
export function deletionId(revision: number): string {
  return String(revision);
}

/**
 * The snapshot after a command, with what the game keeps for restoring brought up to date: a delete keeps the piece it took off the table, and a fixture reset, which rebuilds the table, lets everything kept go.
 */
export function withDeletions(
  before: StoredSnapshot,
  next: StoredSnapshot,
  action: { kind: string; pieceId?: string }
) {
  if (action.kind === 'reset') {
    return next.deletedPieces.length ? { ...next, deletedPieces: [] } : next;
  }
  return action.kind === 'delete' && action.pieceId ? withDeletedPiece(before, next, action.pieceId) : next;
}

/* The snapshot after a delete command, keeping the piece it took off the table whole so the table can bring it back. */
function withDeletedPiece(before: StoredSnapshot, next: StoredSnapshot, pieceId: string): StoredSnapshot {
  const piece = before.table.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || next.table.pieces.some((candidate) => candidate.id === pieceId)) {
    return next;
  }
  /* Oldest first, so a deletion appends one entry and leaves every other where it was for the history's patch. */
  return {
    ...next,
    deletedPieces: [...next.deletedPieces, { id: deletionId(next.revision), piece }].slice(-DELETED_PIECES_LIMIT),
  };
}

/** The table as the room guards it for a restore. */
interface GuardedTable {
  /** The board the game captured, and every piece another player carries locked so packing leaves it be. */
  table: TableState;
  /** Checks the table the room is about to keep, and puts back what it changed to guard it. */
  settle: (placed: TableState) => TableState;
}

/**
 * Any seated player brings a deleted piece back where it lay, or at the nearest free spot, always face down.
 * Face down, a restored card shows nobody a face they could not see before, whatever it showed when it was deleted.
 * A peek held on the piece before it was deleted does not open it again.
 */
export function restoreCommand(
  snapshot: StoredSnapshot,
  action: RestoreAction,
  actorName: string,
  { table, settle }: GuardedTable
): StoredSnapshot {
  const deletion = snapshot.deletedPieces.find((entry) => entry.id === action.deletionId);
  if (!deletion) {
    throw new GameRejection('That piece can no longer be restored.');
  }
  if (table.pieces.some((piece) => piece.id === deletion.piece.id)) {
    throw new GameRejection('That piece is already on the table.');
  }
  const { piece: restored, nudges = [] } = placed(faceDown(deletion.piece), table);
  const next = nextSnapshot(
    snapshot,
    accepted(
      settle({ ...table, pieces: [...withNudges(table.pieces, nudges), restored] }),
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

/*
 * The piece where it lay, or as near as there is room: inside the territory it lay in, making room there as a dropped stack does, and on the table.
 * A piece that moves rests on whatever lies under its new spot and joins the zone it now lies in.
 */
function placed(piece: StoredPiece, table: TableState): { piece: StoredPiece; nudges?: TerritoryNudge[] } {
  const origin = clampPositionToTable(piece, piece.position);
  const landing = territoryLanding(table, piece, origin, table.pieces);
  if (landing === null) {
    throw new GameRejection(`${territoryAtTable(table, origin)!.name} has no room to restore ${deletedName(piece)}.`);
  }
  if (landing) {
    return { piece: at(piece, landing.position, withNudges(table.pieces, landing.nudges)), nudges: landing.nudges };
  }
  const free = nearestCollisionFreePosition(
    piece,
    origin,
    table.pieces,
    keepsInsideTerritory(table, piece, table.pieces)
  );
  if (!free) {
    throw new GameRejection(`There is no room on the table to restore ${deletedName(piece)}.`);
  }
  const moved = free[0] !== piece.position[0] || free[2] !== piece.position[2];
  return { piece: at(piece, moved ? restingPositionAt(free, piece) : piece.position, table.pieces) };
}

/* The piece at a spot, raised onto any leader disc it overlaps there, as a dropped leader is, and in the zone it now lies in. */
function at(piece: StoredPiece, position: Vector3Tuple, others: readonly TablePiece[]): StoredPiece {
  const resting = restingAmongLeaders(piece, position, others);
  return { ...piece, position: resting, zoneId: nearestZone(resting)?.id ?? null };
}

/* Every item turned face down; a piece that cannot be flipped comes back as it was. */
function faceDown(piece: StoredPiece): StoredPiece {
  return isFlippablePiece(piece) ? { ...piece, items: piece.items.map((item) => ({ ...item, faceUp: false })) } : piece;
}
