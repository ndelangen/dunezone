import { CENTER, RADIUS } from '../boards/geometry';
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

/* The clearance kept between two footprints, and between a footprint and the territory's border. */
const GAP = 0.012;
const ITERATIONS = 400;
const SETTLED = 1e-5;

function toTable([x, y]: Readonly<Point>): Plane {
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

function crossings([x, z]: Plane, ring: readonly Plane[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** Ring parity keeps a territory enclosed in another out of the one around it. */
export function territoryContains(territory: TableTerritory, point: Plane): boolean {
  return territory.rings.reduce((count, ring) => count + Number(crossings(point, ring)), 0) % 2 === 1;
}

/** The territory a table point falls in, if any. */
export function territoryShapeAt(board: Board, point: Plane): TableTerritory | undefined {
  return tableTerritories(board).find((territory) => territoryContains(territory, point));
}

/* The point of the territory's border nearest `point`, and how far away it is. */
function nearestBorder(territory: TableTerritory, [x, z]: Plane): { at: Plane; distance: number } {
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
  obstacles: readonly FitBody[];
};

/**
 * Where each body rests once they all fit inside the territory, clear of each other and of the obstacles, or null when they cannot.
 * Every body moves only as far as the overlaps and the border push it.
 */
export function fitIntoTerritory({ territory, bodies, pinFirst, obstacles }: FitInput): Map<string, Plane> | null {
  const at = bodies.map((body) => [body.at[0], body.at[1]] as [number, number]);
  const pinned = (index: number) => pinFirst && index === 0;
  for (let round = 0; round < ITERATIONS; round += 1) {
    let moved = 0;
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const need = bodies[i]!.radius + bodies[j]!.radius + GAP;
        const dx = at[j]![0] - at[i]![0];
        const dz = at[j]![1] - at[i]![1];
        const distance = Math.hypot(dx, dz);
        if (distance >= need) {
          continue;
        }
        const [ux, uz] = distance < 1e-9 ? tieDirection(i + j) : [dx / distance, dz / distance];
        const overlap = need - distance;
        const shareI = pinned(i) ? 0 : pinned(j) ? 1 : 0.5;
        const shareJ = 1 - shareI;
        at[i]![0] -= ux * overlap * shareI;
        at[i]![1] -= uz * overlap * shareI;
        at[j]![0] += ux * overlap * shareJ;
        at[j]![1] += uz * overlap * shareJ;
        moved = Math.max(moved, overlap);
      }
      for (const obstacle of obstacles) {
        if (pinned(i)) {
          break;
        }
        const need = bodies[i]!.radius + obstacle.radius + GAP;
        const dx = at[i]![0] - obstacle.at[0];
        const dz = at[i]![1] - obstacle.at[1];
        const distance = Math.hypot(dx, dz);
        if (distance >= need) {
          continue;
        }
        const [ux, uz] = distance < 1e-9 ? tieDirection(i) : [dx / distance, dz / distance];
        at[i]![0] += ux * (need - distance);
        at[i]![1] += uz * (need - distance);
        moved = Math.max(moved, need - distance);
      }
    }
    for (let i = 0; i < bodies.length; i += 1) {
      const kept = keptInside(territory, at[i]!, bodies[i]!.radius);
      const shift = Math.hypot(kept[0] - at[i]![0], kept[1] - at[i]![1]);
      if (shift > 0) {
        at[i] = [kept[0], kept[1]];
        moved = Math.max(moved, shift);
      }
    }
    if (moved < SETTLED) {
      break;
    }
  }
  /* Pushing straight apart can wedge a stack in a corner of the outline; any stack still out of place then looks for the nearest spot that is free. */
  const clearAt = (i: number, point: Plane) =>
    fitsInside(territory, point, bodies[i]!.radius) &&
    bodies.every(
      (other, j) =>
        j === i || Math.hypot(point[0] - at[j]![0], point[1] - at[j]![1]) >= bodies[i]!.radius + other.radius
    ) &&
    obstacles.every(
      (obstacle) =>
        Math.hypot(point[0] - obstacle.at[0], point[1] - obstacle.at[1]) >= bodies[i]!.radius + obstacle.radius
    );
  for (let i = 0; i < bodies.length; i += 1) {
    if (clearAt(i, at[i]!) || pinned(i)) {
      continue;
    }
    const spot = nearestClearSpot(at[i]!, (point) => clearAt(i, point));
    if (spot) {
      at[i] = [spot[0], spot[1]];
    }
  }
  const fits = bodies.every((_, i) => clearAt(i, at[i]!));
  return fits ? new Map(bodies.map((body, i) => [body.id, at[i]! as Plane])) : null;
}

const SPOT_STEP = 0.02;
const SPOT_RINGS = 80;
const SPOT_DIRECTIONS = 36;
/* The free spot nearest `from`, searched in rings outward. */
function nearestClearSpot(from: Plane, clear: (point: Plane) => boolean): Plane | null {
  for (let ring = 1; ring <= SPOT_RINGS; ring += 1) {
    for (let direction = 0; direction < SPOT_DIRECTIONS; direction += 1) {
      const angle = (direction / SPOT_DIRECTIONS) * Math.PI * 2;
      const point: Plane = [from[0] + Math.cos(angle) * ring * SPOT_STEP, from[1] + Math.sin(angle) * ring * SPOT_STEP];
      if (clear(point)) {
        return point;
      }
    }
  }
  return null;
}
