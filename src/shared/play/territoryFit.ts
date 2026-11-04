import { CENTER, contains, RADIUS } from '../boards/geometry';
import type { Board, Point } from '../boards/schema';
import { propertyId } from '../boards/schema';
import { boardTerritories } from '../boards/territories';
import { BOARD_RADIUS } from './tableGeometry';

/*
 * Pieces resting in a territory keep inside its outline and clear of each other.
 * A stack dropped into a territory takes its place there, and the stacks already inside shift over just enough to make room.
 * The packing works on round footprints in table coordinates and is a pure function of its input.
 * So the page's prediction and the game's own settlement arrive at the same layout.
 */

type Plane = readonly [x: number, z: number];

/** A territory's outline on the table: rings in table x and z, an odd number of which surround every point inside. */
export type TableTerritory = {
  id: string;
  name: string;
  rings: Plane[][];
};

/** A round body the packing places: its id, its footprint's radius, and where it rests now. */
export type FitBody = { id: string; radius: number; at: Plane };

/** A piece the packing keeps clear of without moving it: a round footprint, or a card's or plate's outline across the table. */
export type FitObstacle = FitBody | { id: string; outline: readonly Plane[] };

/* The clearance kept between two footprints, and between a footprint and the territory's border. */
const GAP = 0.012;
const ITERATIONS = 400;
const SETTLED = 1e-5;

/** A board drawing point on the table: board units run across the board's circle, which the table draws BOARD_RADIUS wide. */
export function toTable([x, y]: Readonly<Point>): Plane {
  return [((x - CENTER[0]) / RADIUS) * BOARD_RADIUS, ((y - CENTER[1]) / RADIUS) * BOARD_RADIUS];
}

const shapes = new WeakMap<Board, TableTerritory[]>();
/** Every territory of a board, outlined in table coordinates. A board saved without territories has none. */
export function tableTerritories(board: Board): TableTerritory[] {
  let result = shapes.get(board);
  if (!result) {
    let faces: ReturnType<typeof boardTerritories> = [];
    try {
      faces = boardTerritories(board);
    } catch {
      faces = [];
    }
    result = faces.flatMap((face) => {
      const property = board.properties[face.key];
      return property
        ? [{ id: propertyId(property), name: property.name, rings: face.rings.map((ring) => ring.map(toTable)) }]
        : [];
    });
    shapes.set(board, result);
  }
  return result;
}

/* Odd-even crossings over every ring, so a ring enclosed in another cuts a hole in it. */
function insideRings(rings: readonly (readonly Plane[])[], point: Plane): boolean {
  return contains(rings as Point[][], point as Point);
}

/** Ring parity keeps a territory enclosed in another out of the one around it. */
export function territoryContains(territory: TableTerritory, point: Plane): boolean {
  return insideRings(territory.rings, point);
}

/** The territory a table point falls in, if any. */
export function territoryShapeAt(board: Board, point: Plane): TableTerritory | undefined {
  return tableTerritories(board).find((territory) => territoryContains(territory, point));
}

/* The point of the territory's border nearest `point`, and how far away it is. */
function nearestBorder(territory: Pick<TableTerritory, 'rings'>, [x, z]: Plane): { at: Plane; distance: number } {
  let best: { at: Plane; distance: number } = { at: [x, z], distance: Infinity };
  for (const ring of territory.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j]!;
      const b = ring[i]!;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length = dx * dx + dz * dz;
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length));
      const at: Plane = [a[0] + t * dx, a[1] + t * dz];
      const distance = Math.hypot(x - at[0], z - at[1]);
      if (distance < best.distance) {
        best = { at, distance };
      }
    }
  }
  return best;
}

/** Whether a round footprint lies wholly inside the territory, clear of its border. */
export function fitsInside(territory: TableTerritory, at: Plane, radius: number): boolean {
  return territoryContains(territory, at) && nearestBorder(territory, at).distance >= radius;
}

/* Moves a footprint the least distance that brings it inside the territory with its clearance, or keeps it where it is. */
function keptInside(territory: TableTerritory, at: Plane, radius: number): Plane {
  const margin = radius + GAP;
  const inside = territoryContains(territory, at);
  const border = nearestBorder(territory, at);
  if (inside && border.distance >= margin) {
    return at;
  }
  if (border.distance < 1e-9) {
    return at;
  }
  /* Inside, the footprint steps away from the border; outside, it crosses the border and steps in by its margin. */
  const away = inside ? 1 : -1;
  const ux = ((at[0] - border.at[0]) / border.distance) * away;
  const uz = ((at[1] - border.at[1]) / border.distance) * away;
  return [border.at[0] + ux * margin, border.at[1] + uz * margin];
}

/* A fixed direction for two footprints resting on the same point, so the packing never divides by zero and never guesses. */
function tieDirection(index: number): Plane {
  const angle = index * 2.399963229728653;
  return [Math.cos(angle), Math.sin(angle)];
}

export type FitInput = {
  territory: TableTerritory;
  /** The bodies that may move, the dropped one first. */
  bodies: readonly FitBody[];
  /** Whether the first body keeps the spot it was dropped on, leaving the others to make room. */
  pinFirst: boolean;
  /** Footprints that stay where they are: pieces outside the territory, or locked. */
  obstacles: readonly FitObstacle[];
};

type Spot = [number, number];

/* Pushes two overlapping bodies apart, the pinned one holding still; returns how far they moved. */
function separatePair(input: FitInput, at: Spot[], i: number, j: number): number {
  const { bodies, pinFirst } = input;
  const need = bodies[i]!.radius + bodies[j]!.radius + GAP;
  const dx = at[j]![0] - at[i]![0];
  const dz = at[j]![1] - at[i]![1];
  const distance = Math.hypot(dx, dz);
  if (distance >= need) {
    return 0;
  }
  const [ux, uz] = distance < 1e-9 ? tieDirection(i + j) : [dx / distance, dz / distance];
  const overlap = need - distance;
  /* Each moves half the overlap, unless one is the pinned body, which holds still while the other moves it all. */
  const pinnedI = pinFirst && i === 0;
  const pinnedJ = pinFirst && j === 0;
  const shareI = pinnedI || pinnedJ ? Number(pinnedJ) : 0.5;
  const shareJ = 1 - shareI;
  at[i] = [at[i]![0] - ux * overlap * shareI, at[i]![1] - uz * overlap * shareI];
  at[j] = [at[j]![0] + ux * overlap * shareJ, at[j]![1] + uz * overlap * shareJ];
  return overlap;
}

/*
 * How far a point stands clear of an obstacle's edge, negative when it is inside, and the direction away from it.
 * A round obstacle's edge is its rim; an outline's is the nearest of its sides.
 */
function standoff(point: Plane, obstacle: FitObstacle, tie: number): { clear: number; away: Plane } {
  if ('radius' in obstacle) {
    const dx = point[0] - obstacle.at[0];
    const dz = point[1] - obstacle.at[1];
    const distance = Math.hypot(dx, dz);
    return {
      clear: distance - obstacle.radius,
      away: distance < 1e-9 ? tieDirection(tie) : [dx / distance, dz / distance],
    };
  }
  const edge = nearestBorder({ rings: [obstacle.outline as Plane[]] }, point);
  const inside = insideRings([obstacle.outline], point);
  const sign = inside ? -1 : 1;
  const away: Plane =
    edge.distance < 1e-9
      ? tieDirection(tie)
      : [((point[0] - edge.at[0]) / edge.distance) * sign, ((point[1] - edge.at[1]) / edge.distance) * sign];
  return { clear: edge.distance * sign, away };
}

/* Pushes a body off an obstacle it overlaps; returns how far it moved. */
function clearObstacle(body: FitBody, at: Spot[], i: number, obstacle: FitObstacle): number {
  const { clear, away } = standoff(at[i]!, obstacle, i);
  const push = body.radius + GAP - clear;
  if (push <= 0) {
    return 0;
  }
  at[i] = [at[i]![0] + away[0] * push, at[i]![1] + away[1] * push];
  return push;
}

/* One relaxation round: bodies apart, off the obstacles, then back inside the border; returns the largest step taken. */
function relaxRound(input: FitInput, at: Spot[]): number {
  const { territory, bodies, pinFirst, obstacles } = input;
  let moved = 0;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      moved = Math.max(moved, separatePair(input, at, i, j));
    }
    const free = !(pinFirst && i === 0);
    for (const obstacle of free ? obstacles : []) {
      moved = Math.max(moved, clearObstacle(bodies[i]!, at, i, obstacle));
    }
  }
  bodies.forEach((body, i) => {
    const kept = keptInside(territory, at[i]!, body.radius);
    moved = Math.max(moved, Math.hypot(kept[0] - at[i]![0], kept[1] - at[i]![1]));
    at[i] = [kept[0], kept[1]];
  });
  return moved;
}

/* Whether body `i` could rest at `point`: inside the territory and clear of the other bodies and the obstacles. */
function clearAt({ territory, bodies, obstacles }: FitInput, at: readonly Spot[], i: number, point: Plane): boolean {
  /* Half the clearance the relaxation keeps: a layout it settled passes, and a spot the repair finds still keeps a gap. */
  const radius = bodies[i]!.radius + GAP / 2;
  const apart = (other: Plane, otherRadius: number) =>
    Math.hypot(point[0] - other[0], point[1] - other[1]) >= radius + otherRadius;
  return (
    fitsInside(territory, point, radius) &&
    bodies.every((other, j) => j === i || apart(at[j]!, other.radius)) &&
    obstacles.every((obstacle) => standoff(point, obstacle, i).clear >= radius)
  );
}

/**
 * Where each body rests once they all fit inside the territory, clear of each other and of the obstacles, or null when they cannot.
 * Every body moves only as far as the overlaps and the border push it.
 */
export function fitIntoTerritory(input: FitInput): Map<string, Plane> | null {
  const { bodies, pinFirst } = input;
  const at: Spot[] = bodies.map((body) => [body.at[0], body.at[1]]);
  let round = 0;
  while (round < ITERATIONS && relaxRound(input, at) >= SETTLED) {
    round += 1;
  }
  /* Pushing straight apart can wedge a stack in a corner of the outline; any stack still out of place then looks for the nearest spot that is free. */
  /* The pinned body keeps its spot even here; the final check refuses the layout if it is not clear. */
  const movable = pinFirst ? bodies.slice(1) : bodies;
  const offset = bodies.length - movable.length;
  movable.forEach((_, index) => {
    const i = index + offset;
    if (clearAt(input, at, i, at[i]!)) {
      return;
    }
    const spot = nearestClearSpot(input.territory, at[i]!, (point) => clearAt(input, at, i, point));
    if (spot) {
      at[i] = [spot[0], spot[1]];
    }
  });
  const fits = bodies.every((_, i) => clearAt(input, at, i, at[i]!));
  return fits ? new Map(bodies.map((body, i) => [body.id, at[i]! as Plane])) : null;
}

const SPOT_STEP = 0.02;
const MIN_SPOT_DIRECTIONS = 36;
/*
 * The free spot nearest `from`, searched in rings outward until they pass the territory's farthest corner.
 * Each ring is sampled a step apart along its length, so a wide ring leaves no gap a stack could fit through unseen.
 */
function nearestClearSpot(territory: TableTerritory, from: Plane, clear: (point: Plane) => boolean): Plane | null {
  const reach = Math.max(...territory.rings.flat().map(([x, z]) => Math.hypot(x - from[0], z - from[1])));
  for (let ring = 1; ring * SPOT_STEP <= reach + SPOT_STEP; ring += 1) {
    const radius = ring * SPOT_STEP;
    const directions = Math.max(MIN_SPOT_DIRECTIONS, Math.ceil((Math.PI * 2 * radius) / SPOT_STEP));
    for (let direction = 0; direction < directions; direction += 1) {
      const angle = (direction / directions) * Math.PI * 2;
      const point: Plane = [from[0] + Math.cos(angle) * radius, from[1] + Math.sin(angle) * radius];
      if (clear(point)) {
        return point;
      }
    }
  }
  return null;
}

/** The point of a territory furthest from its border, found on a grid: where a stack set down in it has the most room. */
export function innermostPoint(territory: TableTerritory, step = 0.02): Plane {
  const points = territory.rings.flat();
  const xs = points.map(([x]) => x);
  const zs = points.map(([, z]) => z);
  let best: { at: Plane; room: number } = { at: points[0] ?? [0, 0], room: -1 };
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step) {
    for (let z = Math.min(...zs); z <= Math.max(...zs); z += step) {
      if (!territoryContains(territory, [x, z])) {
        continue;
      }
      const room = nearestBorder(territory, [x, z]).distance;
      if (room > best.room) {
        best = { at: [x, z], room };
      }
    }
  }
  return best.at;
}
