import type { Board } from '../boards/schema';
import { placeStickers, TABLE_STICKER_LARGEST } from '../boards/stickerPlacement';
import { boardPointToTable, boardTerritory, tableTerritoryAt } from '../boards/tableTerritories';
import type { TablePiece, Vector3Tuple } from './model';
import type { GameSnapshot } from './protocol';
import { isSpicePiece } from './spice';
import { createSpiceStack } from './spiceBank';
import type { SpiceBlow } from './spiceBlow';
import type { SpiceBlowPlacement } from './spiceBlowPlacement';
import { revealedSpiceBlow, revealedSpiceBlows } from './spiceBlowPlacement';
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

/* The spots the card's own map placed its tokens on, in table units, that lie in this territory; only on the board the card was drawn on. */
function cardSpotsIn(board: Board, boardId: string | undefined, blow: SpiceBlow, territory: string): TablePoint[] {
  const own = blow.boardId && blow.boardId === boardId ? (blow.spots ?? []) : [];
  return own.map(boardPointToTable).filter(([x, z]) => tableTerritoryAt(board, x, z)?.id === territory);
}

/*
 * The spots to try in a territory: first the exact spot the card's own map puts its spice on, so the spice lands where the card shows it;
 * then the spice sticker the table lights a card without one with; then the territory's middle.
 */
function startingPoints({ board, territory }: Search, boardId: string | undefined, blow: SpiceBlow, marks: Landmarks) {
  return [...cardSpotsIn(board, boardId, blow, territory), ...marks.sticker, marks.centre].filter(
    ([x, z]) => tableTerritoryAt(board, x, z)?.id === territory
  );
}

/** A spot a face-up spice card marks exactly, where the table draws its spice sticker. */
export type SpiceBlowPin = Readonly<{ territory: string; at: TablePoint }>;

/**
 * Where the face-up spice cards mark their spice exactly: the spots their own maps put tokens on, in the territories they name.
 * The table draws the spice sticker there instead of where a territory has the most room, so the sticker and the placed spice sit where the card shows them.
 */
export function spiceBlowPins(snapshot: Pick<GameSnapshot, 'board'>, pieces: readonly TablePiece[]): SpiceBlowPin[] {
  const board = snapshot.board?.definition;
  if (!board) {
    return [];
  }
  const pins = revealedSpiceBlows(pieces).flatMap(({ blow }) =>
    blow.territories.flatMap((territory) =>
      cardSpotsIn(board, snapshot.board?.asset.id, blow, territory).map((at) => ({ territory, at }))
    )
  );
  /* Two face-up cards that mark the same spot pin one sticker there. */
  return pins.filter(
    (pin, index) =>
      pins.findIndex(
        (other) => other.territory === pin.territory && other.at[0] === pin.at[0] && other.at[1] === pin.at[1]
      ) === index
  );
}

/**
 * The territories a face-up spice card names without marking a spot there, which keep the spice sticker the table places where the territory has the most room.
 * A territory one card pins and another card only names stays here, so the second card's sticker still shows where its spice would land.
 */
export function spiceBlowUnpinnedTerritories(
  snapshot: Pick<GameSnapshot, 'board'>,
  pieces: readonly TablePiece[]
): string[] {
  const board = snapshot.board?.definition;
  const named = revealedSpiceBlows(pieces).flatMap(({ blow }) =>
    blow.territories.filter(
      (territory) => !board || cardSpotsIn(board, snapshot.board?.asset.id, blow, territory).length === 0
    )
  );
  return [...new Set(named)];
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
 * Where a revealed spice card on top of this piece would set its spice down, and how much: the first territory it names that this board has (its own map's spots in any of them first), onto spice already lying there, or else at a free spot that stays inside that territory.
 * Null when the table has no board, the piece shows no spice card, or no territory it names has room.
 */
export function spiceBlowSpot(
  snapshot: Pick<GameSnapshot, 'board'>,
  pieces: readonly TablePiece[],
  piece: TablePiece
): (SpiceBlowPlacement & { amount: number }) | null {
  const blow = revealedSpiceBlow(piece)?.blow;
  const board = snapshot.board?.definition;
  if (!blow || !board) {
    return null;
  }
  const footprint = spiceFootprint(blow.amount);
  const boardId = snapshot.board?.asset.id;
  /*
   * Two passes: first only the card's own spots (or spice already lying where it marks one), across every territory it names, so the spice lands where the table pins it;
   * then every territory with its computed sticker and middle, for a card without a usable spot.
   */
  const passes: ((search: Search, marks: Landmarks) => readonly TablePoint[] | null)[] = [
    (search) => {
      const spots = cardSpotsIn(board, boardId, blow, search.territory);
      return spots.length ? spots : null;
    },
    (search, marks) => startingPoints(search, boardId, blow, marks),
  ];
  for (const pointsFor of passes) {
    for (const territory of blow.territories) {
      const marks = landmarks(board, territory);
      const search = { board, pieces, territory };
      const points = marks && pointsFor(search, marks);
      const position = points && (pileIn(search)?.position ?? freeSpotIn(search, footprint, points));
      if (marks && position) {
        return { pieceId: piece.id, territory, name: marks.name, position: [...position], amount: blow.amount };
      }
    }
  }
  return null;
}
