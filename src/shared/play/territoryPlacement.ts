import { retainedArrakisBoard } from '../boards/geometry';
import { isFactionToken } from './factionToken';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { isPointerToken, pointerCovers } from './pointerToken';
import { restingPositionAt } from './tableGeometry';
import { footprintReach, hasRoundFootprint } from './tablePhysics';
import { fitIntoTerritory, territoryShapeAt, territoryContains } from './territoryFit';
import type { FitBody, TableTerritory } from './territoryFit';

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

function bounds(territory: TableTerritory) {
  const points = territory.rings.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  };
}

export type TerritoryLayout = {
  territory: TableTerritory;
  /** Where the landing stack rests. */
  position: Vector3Tuple;
  /** Where each stack already in the territory moves to, keyed by its id; one that stays put is left out. */
  nudges: Map<string, Vector3Tuple>;
};

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
  if (!packsInTerritory(piece)) {
    return undefined;
  }
  const territory = territoryAtTable(state, at);
  const plates = others.filter((candidate) => isPointerToken(candidate) && !candidate.inventory);
  const onPlate = (point: Readonly<Vector3Tuple>) => plates.some((plate) => pointerCovers(plate, point));
  /* A stack set on a plate such as the HMS rides it, and the plate's own rules place it. */
  if (!territory || onPlate(at)) {
    return undefined;
  }
  const box = bounds(territory);
  const reach = 1;
  const near = (candidate: TablePiece) =>
    candidate.position[0] >= box.minX - reach &&
    candidate.position[0] <= box.maxX + reach &&
    candidate.position[2] >= box.minZ - reach &&
    candidate.position[2] <= box.maxZ + reach;
  const relevant = others.filter(
    (candidate) => candidate.id !== piece.id && !candidate.inventory && candidate.items.length > 0 && near(candidate)
  );
  /* Riders stay on their plate, so they are in the way rather than moved. */
  const inside = (candidate: TablePiece) =>
    packsInTerritory(candidate) &&
    !onPlate(candidate.position) &&
    territoryContains(territory, [candidate.position[0], candidate.position[2]]);
  const settled = relevant.filter(inside).sort((a, b) => a.id.localeCompare(b.id));
  /* A plate is in the way only of another plate, and nothing here is one. */
  const obstacles = relevant
    .filter((candidate) => !inside(candidate) && !isPointerToken(candidate))
    .map((o) => body(o));
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
  const nudges = new Map<string, Vector3Tuple>();
  for (const candidate of settled) {
    const [x, z] = fitted.get(candidate.id)!;
    if (Math.hypot(x - candidate.position[0], z - candidate.position[2]) > 1e-6) {
      nudges.set(candidate.id, restingPositionAt([x, candidate.position[1], z], candidate));
    }
  }
  return { territory, position: restingPositionAt([landing[0], at[1], landing[1]], piece), nudges };
}

/**
 * Where a stack let go at `at` rests in its territory, a spot where the move's own packing is sure to fit.
 * It is undefined outside the territories, and null when the territory is full.
 */
export function territoryLanding(
  state: Pick<TableState, 'board'>,
  piece: TablePiece,
  at: Vector3Tuple,
  others: readonly TablePiece[]
): Vector3Tuple | null | undefined {
  const held = territoryLayout(state, piece, at, others, true);
  if (held === undefined) {
    return undefined;
  }
  /* Held where it was let go, the stack may still step in from the border; failing that, it gives way to the others too. */
  const found = held ?? territoryLayout(state, piece, at, others, false);
  if (!found) {
    return null;
  }
  /* The spot must stay in the same territory, and hold there while the others move round it, as the move will pack it. */
  const confirmed = territoryLayout(state, piece, found.position, others, true);
  return confirmed && confirmed.territory.id === found.territory.id ? confirmed.position : null;
}

/** The table's pieces once the stacks around a landed one have shifted over to make room in its territory. */
export function piecesNudgedAround(
  state: Pick<TableState, 'board'>,
  pieces: TablePiece[],
  landed: TablePiece
): TablePiece[] {
  const layout = territoryLayout(state, landed, landed.position, pieces, true);
  if (!layout?.nudges.size) {
    return pieces;
  }
  return pieces.map((candidate) => {
    const position = layout.nudges.get(candidate.id);
    return position ? { ...candidate, position } : candidate;
  });
}
