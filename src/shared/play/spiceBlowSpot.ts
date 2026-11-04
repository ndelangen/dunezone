import { retainedArrakisBoard } from '../boards/geometry';
import type { Board } from '../boards/schema';
import { placeStickers, TABLE_STICKER_LARGEST } from '../boards/stickerPlacement';
import { boardPointToTable, boardTerritory, tableTerritoryAt } from '../boards/tableTerritories';
import type { TablePiece, Vector3Tuple } from './model';
import type { GameSnapshot } from './protocol';
import { isSpicePiece } from './spice';
import { createSpiceStack } from './spiceBank';
import type { SpiceBlow } from './spiceBlow';
import type { SpiceBlowPlacement } from './spiceBlowPlacement';
import { revealedSpiceBlow } from './spiceBlowPlacement';
import { restingPositionAt } from './tableGeometry';
import { nearestCollisionFreePosition } from './tablePhysics';

type TablePoint = readonly [number, number];
type Landmarks = Readonly<{ name: string; sticker: readonly TablePoint[]; centre: TablePoint }>;

/* Each board's territories, where the table lights their spice sticker and their middle, worked out once: the sticker search samples the whole territory. */
const landmarksByBoard = new WeakMap<Board, Map<string, Landmarks | null>>();

function landmarks(board: Board, territory: string): Landmarks | null {
  let byTerritory = landmarksByBoard.get(board);
  if (!byTerritory) {
    byTerritory = new Map();
    landmarksByBoard.set(board, byTerritory);
  }
  if (!byTerritory.has(territory)) {
    const found = boardTerritory(board, territory);
    const rings = found?.rings.map((ring) => ring.map(boardPointToTable));
    byTerritory.set(
      territory,
      found && rings
        ? {
            name: found.name,
            sticker: placeStickers(rings, 1, TABLE_STICKER_LARGEST).at,
            centre: boardPointToTable(found.centre),
          }
        : null
    );
  }
  return byTerritory.get(territory) ?? null;
}

/* One territory's search for room: the board, what lies on the table, and the territory. */
type Search = Readonly<{ board: Board; pieces: readonly TablePiece[]; territory: string }>;

/* The stack the card's spice would make, for finding room for it. */
function spiceFootprint(amount: number): TablePiece {
  const stack = createSpiceStack(0, 1);
  return {
    ...stack,
    items: Array.from({ length: amount }, (_, index) => ({ id: `spice-blow-${index}`, faceUp: true })),
  };
}

/*
 * The spots to try in a territory: first the spice sticker the table lights it with, so the spice covers the marker that asked for it;
 * then where the card's own map put its tokens, when it was drawn on this board; then the territory's middle.
 */
function startingPoints({ board, territory }: Search, boardId: string | undefined, blow: SpiceBlow, marks: Landmarks) {
  const own = blow.boardId && blow.boardId === boardId ? (blow.spots ?? []) : [];
  return [...marks.sticker, ...own.map(boardPointToTable), marks.centre].filter(
    ([x, z]) => tableTerritoryAt(board, x, z)?.id === territory
  );
}

/* Spice already lying in the territory, which takes the card's spice onto its pile so a blown territory keeps one stack; a held or carried pile is not one. */
function pileIn({ board, pieces, territory }: Search) {
  return pieces.find(
    (candidate) =>
      isSpicePiece(candidate) &&
      !candidate.locked &&
      tableTerritoryAt(board, candidate.position[0], candidate.position[2])?.id === territory
  );
}

/* The free spot nearest one of the starting points that keeps the whole stack's centre inside the territory. */
function freeSpotIn(
  { board, pieces, territory }: Search,
  footprint: TablePiece,
  points: readonly TablePoint[]
): Vector3Tuple | null {
  const inside = ([px, , pz]: Vector3Tuple) => tableTerritoryAt(board, px, pz)?.id === territory;
  for (const [x, z] of points) {
    const position = nearestCollisionFreePosition(
      footprint,
      restingPositionAt([x, 0, z], footprint),
      [...pieces],
      inside
    );
    if (position) {
      return position;
    }
  }
  return null;
}

/**
 * Where a revealed spice card on top of this piece would set its spice down, and how much: the first territory it names that this board has, onto spice already lying there, or else at a free spot that stays inside that territory.
 * Null when the piece shows no spice card, or no territory it names has room.
 */
export function spiceBlowSpot(
  snapshot: Pick<GameSnapshot, 'board'>,
  pieces: readonly TablePiece[],
  piece: TablePiece
): (SpiceBlowPlacement & { amount: number }) | null {
  const blow = revealedSpiceBlow(piece)?.blow;
  if (!blow) {
    return null;
  }
  const board = snapshot.board?.definition ?? retainedArrakisBoard();
  const footprint = spiceFootprint(blow.amount);
  for (const territory of blow.territories) {
    const marks = landmarks(board, territory);
    if (!marks) {
      continue;
    }
    const search = { board, pieces, territory };
    const position =
      pileIn(search)?.position ??
      freeSpotIn(search, footprint, startingPoints(search, snapshot.board?.asset.id, blow, marks));
    if (position) {
      return { pieceId: piece.id, territory, name: marks.name, position: [...position], amount: blow.amount };
    }
  }
  return null;
}
