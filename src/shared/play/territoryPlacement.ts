import { isFactionToken } from './factionToken';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { isPointerToken, pointerCovers } from './pointerToken';
import { restingPositionAt } from './tableGeometry';
import { footprintOutline, footprintReach, hasRoundFootprint } from './tablePhysics';
import {
  fitIntoTerritory,
  restsInside,
  restingParts,
  territoryBounds,
  territoryShapeAt,
  territoryContains,
} from './territoryFit';
import type { FitBody, FitObstacle, TableTerritory } from './territoryFit';

/*
 * Stacks set down in a territory keep inside it: the stacks already there shift over to make room for the one that lands.
 * The settlement picks where the landing stack rests, and the move applies the same packing to everything around it.
 * Both work from the one layout the page predicts and the game confirms.
 */

/** Whether a piece takes part in a territory's packing: a loose, unlocked round stack such as troops, a leader or spice. */
export function packsInTerritory(piece: TablePiece): boolean {
  return (
    !piece.inventory &&
    !piece.locked &&
    piece.items.length > 0 &&
    piece.kind !== 'card' &&
    !isPointerToken(piece) &&
    !isFactionToken(piece) &&
    hasRoundFootprint(piece)
  );
}

/** The territory a table point lies in on the table's board, if any; a table without a board has none. */
export function territoryAtTable(state: Pick<TableState, 'board'>, [x, , z]: Readonly<Vector3Tuple>) {
  return state.board && territoryShapeAt(state.board, [x, z]);
}

function body(piece: TablePiece, at: Readonly<Vector3Tuple> = piece.position): FitBody {
  return { id: piece.id, radius: footprintReach(piece), at: [at[0], at[2]] };
}

/* A piece in the way, by its real footprint: round, or the outline of a card or tile. */
function obstacle(piece: TablePiece): FitObstacle {
  const outline = footprintOutline(piece);
  return outline ? { id: piece.id, outline } : body(piece);
}

/** A stack already in a territory shifted over to make room for one landing there. */
export type TerritoryNudge = { pieceId: string; position: Vector3Tuple };

/* A stack let go at `at`, and every other piece on the table. */
type TerritoryDrop = { piece: TablePiece; at: Vector3Tuple; others: readonly TablePiece[] };

export type TerritoryLayout = {
  territory: TableTerritory;
  /** Where the landing stack rests. */
  position: Vector3Tuple;
  /** Where each stack already in the territory moves to; one that stays put is left out. */
  nudges: TerritoryNudge[];
};

/* Whether a point lies on a plate such as the HMS. */
function onAnyPlate(others: readonly TablePiece[], point: Readonly<Vector3Tuple>) {
  return others.some((plate) => isPointerToken(plate) && !plate.inventory && pointerCovers(plate, point));
}

/**
 * Whether a stack placed as any other piece, off the territory it was let go in or nudged clear of what was in the way, rests wholly inside any territory its centre lands in.
 * So the nearest free spot never leaves it across a border;
 * a piece that does not pack, or one on a plate such as the HMS, may rest anywhere.
 */
export function keepsInsideTerritory(
  state: Pick<TableState, 'board'>,
  piece: TablePiece,
  others: readonly TablePiece[]
) {
  return (at: Readonly<Vector3Tuple>) => {
    const territory = packsInTerritory(piece) ? territoryAtTable(state, at) : undefined;
    if (!territory || onAnyPlate(others, at)) {
      return true;
    }
    /* In the sector it lands in, as a drop there would rest it. */
    const point: [number, number] = [at[0], at[2]];
    const radius = footprintReach(piece);
    return restingParts(territory, point, radius).some((part) => restsInside(part, point, radius));
  };
}

/* The other pieces on the table close enough to the territory to matter. */
function piecesNear(territory: TableTerritory, piece: TablePiece, others: readonly TablePiece[]) {
  const box = territoryBounds(territory);
  const reach = 1;
  const near = ({ position: [x, , z] }: TablePiece) =>
    x >= box.minX - reach && x <= box.maxX + reach && z >= box.minZ - reach && z <= box.maxZ + reach;
  return others.filter(
    (candidate) => candidate.id !== piece.id && !candidate.inventory && candidate.items.length > 0 && near(candidate)
  );
}

/* Where each stack already in the territory moves to, leaving out the ones that stay put. */
function nudgesFrom(settled: readonly TablePiece[], fitted: Map<string, readonly [number, number]>): TerritoryNudge[] {
  return settled.flatMap((candidate) => {
    const [x, z] = fitted.get(candidate.id)!;
    const moved = Math.hypot(x - candidate.position[0], z - candidate.position[2]) > 1e-6;
    return moved
      ? [{ pieceId: candidate.id, position: restingPositionAt([x, candidate.position[1], z], candidate) }]
      : [];
  });
}

/**
 * Packs `piece` into one part of the territory, the stretch of it within one sector, together with the stacks already resting there.
 * `others` lists them along with everything else on the table.
 * Null when that part has no room for it.
 * With `pinned`, the landing stack keeps its spot and only the others move.
 */
function partLayout(
  territory: TableTerritory,
  part: TableTerritory,
  drop: TerritoryDrop,
  pinned: boolean
): TerritoryLayout | null {
  const { piece, at, others } = drop;
  const relevant = piecesNear(territory, piece, others);
  /* Riders stay on their plate, so they are in the way rather than moved. */
  /* Across a whole territory the sector lines divide, the stacks already there hold still, so none is moved into another sector. */
  const movesOver = part !== territory || !territory.sectored;
  const inside = (candidate: TablePiece) =>
    movesOver &&
    packsInTerritory(candidate) &&
    !onAnyPlate(others, candidate.position) &&
    territoryContains(part, [candidate.position[0], candidate.position[2]]) &&
    /* A stack the whole territory took across a line, too big for this sector, holds still rather than be squeezed into it. */
    (part === territory ||
      restsInside(part, [candidate.position[0], candidate.position[2]], footprintReach(candidate)));
  const settled = relevant.filter(inside).sort((a, b) => a.id.localeCompare(b.id));
  /* A plate such as the HMS is in the way by its outline, so no stack is shifted onto it without riding it. */
  const obstacles = relevant.filter((candidate) => !inside(candidate)).map(obstacle);
  const fitted = fitIntoTerritory({
    territory: part,
    bodies: [body(piece, at), ...settled.map((candidate) => body(candidate))],
    pinFirst: pinned,
    obstacles,
  });
  if (!fitted) {
    return null;
  }
  const landing = fitted.get(piece.id)!;
  return {
    territory,
    position: restingPositionAt([landing[0], at[1], landing[1]], piece),
    nudges: nudgesFrom(settled, fitted),
  };
}

/**
 * Where a stack let go at `at` rests in its territory, and where the stacks already there shift to make room.
 * It is undefined outside the territories, and null when the territory is full.
 */
export function territoryLanding(
  state: Pick<TableState, 'board'>,
  piece: TablePiece,
  at: Vector3Tuple,
  others: readonly TablePiece[]
): TerritoryLayout | null | undefined {
  const drop = { piece, at, others };
  const territory = packsInTerritory(piece) ? territoryAtTable(state, at) : undefined;
  /* A stack set on a plate such as the HMS rides it, and the plate's own rules place it. */
  if (!territory || onAnyPlate(others, at)) {
    return undefined;
  }
  /*
   * It rests in the sector it was let go in, so a full sector refuses it rather than move it into another.
   * Held where it was let go it may still step in from the border, and failing that it gives way to the others too.
   */
  for (const part of restingParts(territory, [at[0], at[2]], footprintReach(piece))) {
    const layout = partLayout(territory, part, drop, true) ?? partLayout(territory, part, drop, false);
    if (layout) {
      return layout;
    }
  }
  return null;
}

/** The table's pieces with the stacks a landing shifted moved to their new spots. */
export function withNudges(
  pieces: TablePiece[],
  nudges: readonly { pieceId: string; position: Vector3Tuple }[] | undefined
): TablePiece[] {
  if (!nudges?.length) {
    return pieces;
  }
  const moved = new Map(nudges.map(({ pieceId, position }) => [pieceId, position]));
  return pieces.map((candidate) => {
    const position = moved.get(candidate.id);
    return position ? { ...candidate, position: [...position] } : candidate;
  });
}
