import { retainedArrakisBoard } from '../boards/geometry';
import type { Board } from '../boards/schema';
import { boardPointToTable, boardTerritory, tableTerritoryAt } from '../boards/tableTerritories';
import type { TablePiece, Vector3Tuple } from './model';
import type { GameSnapshot } from './protocol';
import { createSpiceStack } from './spiceBank';
import type { SpiceBlow } from './spiceBlow';
import type { SpiceBlowPlacement } from './spiceBlowPlacement';
import { revealedSpiceBlow } from './spiceBlowPlacement';
import { restingPositionAt } from './tableGeometry';
import { nearestCollisionFreePosition } from './tablePhysics';

/* The stack the card's spice would make, for finding room for it. */
function spiceFootprint(amount: number): TablePiece {
  const stack = createSpiceStack(0, 1);
  return {
    ...stack,
    items: Array.from({ length: amount }, (_, index) => ({ id: `spice-blow-${index}`, faceUp: true })),
  };
}

/* The spots to try in a territory: where the card's own map put its tokens, when it was drawn on this board, then the territory's middle. */
function startingPoints(board: Board, boardId: string | undefined, blow: SpiceBlow, territory: string) {
  const found = boardTerritory(board, territory);
  if (!found) {
    return null;
  }
  const own = blow.boardId && blow.boardId === boardId ? (blow.spots ?? []) : [];
  const points = [...own.map(boardPointToTable), boardPointToTable(found.centre)].filter(
    ([x, z]) => tableTerritoryAt(board, x, z)?.id === territory
  );
  return { name: found.name, points };
}

/**
 * Where a revealed spice card on top of this piece would set its spice down: the first territory it names that this board has, at a free spot that stays inside that territory.
 * Null when the piece shows no spice card, or no territory it names has room.
 */
export function spiceBlowSpot(
  snapshot: Pick<GameSnapshot, 'board'>,
  pieces: readonly TablePiece[],
  piece: TablePiece
): SpiceBlowPlacement | null {
  const revealed = revealedSpiceBlow(piece);
  if (!revealed) {
    return null;
  }
  const { blow } = revealed;
  const board = snapshot.board?.definition ?? retainedArrakisBoard();
  const footprint = spiceFootprint(blow.amount);
  for (const territory of blow.territories) {
    const start = startingPoints(board, snapshot.board?.asset.id, blow, territory);
    for (const [x, z] of start?.points ?? []) {
      const position = nearestCollisionFreePosition(
        footprint,
        restingPositionAt([x, 0, z], footprint),
        [...pieces],
        ([px, , pz]: Vector3Tuple) => tableTerritoryAt(board, px, pz)?.id === territory
      );
      if (position) {
        return { pieceId: piece.id, territory, name: start!.name, position };
      }
    }
  }
  return null;
}
