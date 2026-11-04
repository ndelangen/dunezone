import { retainedArrakisBoard } from '../boards/geometry';
import { isFactionToken } from './factionToken';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { isPointerToken, pointerCovers } from './pointerToken';
import { restingPositionAt } from './tableGeometry';
import { footprintOutline, footprintReach, hasRoundFootprint } from './tablePhysics';
import { fitIntoTerritory, territoryShapeAt, territoryContains } from './territoryFit';
import type { FitBody, FitObstacle, TableTerritory } from './territoryFit';

/*
 * Stacks set down in a territory keep inside it: the stacks already there shift over to make room for the one that lands.
 * The settlement picks where the landing stack rests, and the move applies the same packing to everything around it.
 * Both work from the one layout the page predicts and the game confirms.
 */

/** A table without a captured board plays on the rulebook Arrakis the page draws for it. */
export function tableBoard(state: Pick<TableState, 'board'>) {
  return state.board ?? retainedArrakisBoard();
}

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

/** The territory a table point lies in on the table's board, if any. */
export function territoryAtTable(state: Pick<TableState, 'board'>, [x, , z]: Readonly<Vector3Tuple>) {
  return territoryShapeAt(tableBoard(state), [x, z]);
}

function body(piece: TablePiece, at: Readonly<Vector3Tuple> = piece.position): FitBody {
  return { id: piece.id, radius: footprintReach(piece), at: [at[0], at[2]] };
}

/* A piece in the way, by its real footprint: round, or the outline of a card or tile. */
function obstacle(piece: TablePiece): FitObstacle {
  const outline = footprintOutline(piece);
  return outline ? { id: piece.id, outline } : body(piece);
}

function bounds(territory: TableTerritory) {
  const points = territory.rings.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  };
}

/** A stack already in a territory shifted over to make room for one landing there. */
export type TerritoryNudge = { pieceId: string; position: Vector3Tuple };

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

/* The other pieces on the table close enough to the territory to matter. */
function piecesNear(territory: TableTerritory, piece: TablePiece, others: readonly TablePiece[]) {
  const box = bounds(territory);
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
 * Packs `piece` into the territory under `at` together with the stacks already there, which `others` lists along with everything else on the table.
 * Undefined when the point lies in no territory or the piece does not pack, so the caller places it as any other piece;
 * null when the territory has no room for it.
 * With `pinned`, the landing stack keeps its spot and only the others move.
 */
export function territoryLayout(
  state: Pick<TableState, 'board'>,
  piece: TablePiece,
  at: Vector3Tuple,
  others: readonly TablePiece[],
  pinned: boolean
): TerritoryLayout | null | undefined {
  const territory = packsInTerritory(piece) ? territoryAtTable(state, at) : undefined;
  /* A stack set on a plate such as the HMS rides it, and the plate's own rules place it. */
  if (!territory || onAnyPlate(others, at)) {
    return undefined;
  }
  const relevant = piecesNear(territory, piece, others);
  /* Riders stay on their plate, so they are in the way rather than moved. */
  const inside = (candidate: TablePiece) =>
    packsInTerritory(candidate) &&
    !onAnyPlate(others, candidate.position) &&
    territoryContains(territory, [candidate.position[0], candidate.position[2]]);
  const settled = relevant.filter(inside).sort((a, b) => a.id.localeCompare(b.id));
  /* A plate such as the HMS is in the way by its outline, so no stack is shifted onto it without riding it. */
  const obstacles = relevant.filter((candidate) => !inside(candidate)).map(obstacle);
  const fitted = fitIntoTerritory({
    territory,
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
  const held = territoryLayout(state, piece, at, others, true);
  /* Held where it was let go, the stack may still step in from the border; failing that, it gives way to the others too. */
  return held === null ? territoryLayout(state, piece, at, others, false) : held;
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
