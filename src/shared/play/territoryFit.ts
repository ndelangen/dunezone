import { contains } from '../boards/geometry';
import type { Board, Point } from '../boards/schema';
import { propertyId } from '../boards/schema';
import { boardPointToTable } from '../boards/tableTerritories';
import { boardTerritories } from '../boards/territories';
import { sectorIndexAt } from './factionToken';
import { STORM_SECTOR_ANGLE } from './stormSector';
import { TABLE_SECTOR_COUNT } from './tableSettings';

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
  /** Whether the storm's sector lines divide it, so a stack rests in one sector of it; the polar sink lies in none. */
  sectored?: boolean;
};

/** A round body the packing places: its id, its footprint's radius, and where it rests now. */
export type FitBody = { id: string; radius: number; at: Plane };

/** A piece the packing keeps clear of without moving it: a round footprint, or a card's or plate's outline across the table. */
export type FitObstacle = FitBody | { id: string; outline: readonly Plane[] };

/* The clearance kept between two footprints, and between a footprint and the territory's border. */
const GAP = 0.012;
const ITERATIONS = 400;
const SETTLED = 1e-5;

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
        ? [
            {
              id: propertyId(property),
              name: property.name,
              rings: face.rings.map((ring) => ring.map(boardPointToTable)),
              sectored: property.type !== 'polar',
            },
          ]
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

/*
 * Up to 30% of a stack's footprint may hang over a territory's border or a sector line, so stacks pack more closely and still read as standing in one place.
 * The packing steps a footprint in until its centre is 0.32 of its radius inside, which leaves 30% of a circle beyond a straight edge.
 * Where a stack rests is then checked against the footprint's real area inside the outline, so a corner never lets more of it out.
 */
const BORDER_REACH = 0.32;
const MOST_OUTSIDE = 0.3;

/** How far inside a border the packing steps the centre of a footprint of `radius`. */
function borderReach(radius: number): number {
  return radius * BORDER_REACH;
}

/* The signed area a circle of `radius` round the origin shares with the triangle of the origin, `a` and `b`. */
function sharedWithTriangle(a: Plane, b: Plane, radius: number): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  /* Where the side from a to b crosses the circle, as fractions of the way along it. */
  const qa = dx * dx + dz * dz;
  const qb = 2 * (a[0] * dx + a[1] * dz);
  const qc = a[0] * a[0] + a[1] * a[1] - radius * radius;
  const stops = [0];
  const disc = qb * qb - 4 * qa * qc;
  if (qa > 0 && disc > 0) {
    const root = Math.sqrt(disc);
    for (const t of [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]) {
      if (t > 0 && t < 1) {
        stops.push(t);
      }
    }
  }
  stops.push(1);
  let area = 0;
  for (let i = 1; i < stops.length; i += 1) {
    const p: Plane = [a[0] + dx * stops[i - 1]!, a[1] + dz * stops[i - 1]!];
    const q: Plane = [a[0] + dx * stops[i]!, a[1] + dz * stops[i]!];
    const cross = p[0] * q[1] - p[1] * q[0];
    const mid: Plane = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    /* Inside the circle the piece of side bounds a triangle; outside, or only touching it, the circle's arc bounds a slice. */
    area +=
      mid[0] * mid[0] + mid[1] * mid[1] < radius * radius * (1 - 1e-9)
        ? cross / 2
        : (radius * radius * Math.atan2(cross, p[0] * q[0] + p[1] * q[1])) / 2;
  }
  return area;
}

const ringDepths = new WeakMap<readonly (readonly Plane[])[], number[]>();

/*
 * How many of the other rings enclose each ring: an odd number makes it a hole.
 * A ring counts as inside another when most of its corners are, so a hole that touches the outline at a corner or two is still a hole.
 */
function depthsOf(rings: readonly (readonly Plane[])[]): number[] {
  let depths = ringDepths.get(rings);
  if (!depths) {
    const encloses = (other: readonly Plane[], ring: readonly Plane[]) =>
      ring.filter((corner) => insideRings([other], corner)).length * 2 > ring.length;
    depths = rings.map((ring, i) => rings.filter((other, j) => j !== i && encloses(other, ring)).length);
    ringDepths.set(rings, depths);
  }
  return depths;
}

/** The share of a round footprint at `at` that lies outside the outline, from 0 to 1. */
export function shareOutside(territory: Pick<TableTerritory, 'rings'>, [x, z]: Plane, radius: number): number {
  const depths = depthsOf(territory.rings);
  let inside = 0;
  territory.rings.forEach((ring, index) => {
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      area += sharedWithTriangle([ring[j]![0] - x, ring[j]![1] - z], [ring[i]![0] - x, ring[i]![1] - z], radius);
    }
    inside += depths[index]! % 2 === 0 ? Math.abs(area) : -Math.abs(area);
  });
  return Math.min(1, Math.max(0, 1 - inside / (Math.PI * radius * radius)));
}

/** Whether a stack with a footprint of `radius` rests in the territory: its centre inside, and no more than 30% of it over the outline. */
export function restsInside(territory: TableTerritory, at: Plane, radius: number): boolean {
  return territoryContains(territory, at) && shareOutside(territory, at, radius) <= MOST_OUTSIDE + 1e-9;
}

/** Whether a round footprint lies wholly inside the territory, clear of its border. */
function fitsInside(territory: TableTerritory, at: Plane, radius: number): boolean {
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
  /**
   * In a stretch too narrow or too full for the usual rule: each centre keeps only as far inside the border as a narrow part allows for its own size, however much of the footprint then hangs over it.
   * Left out, a centre steps in 0.32 of its radius and no more than 30% of a footprint may hang over.
   */
  narrow?: boolean;
};

/* How far inside the border the packing keeps a footprint's centre. */
function reachOf(input: Pick<FitInput, 'territory' | 'narrow'>, radius: number): number {
  return input.narrow ? narrowInset(input.territory, radius) : borderReach(radius);
}

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
    const kept = keptInside(territory, at[i]!, reachOf(input, body.radius));
    moved = Math.max(moved, Math.hypot(kept[0] - at[i]![0], kept[1] - at[i]![1]));
    at[i] = [kept[0], kept[1]];
  });
  return moved;
}

/* Whether body `i` could rest at `point`: inside the territory and clear of the other bodies and the obstacles. */
function clearAt(input: FitInput, at: readonly Spot[], i: number, point: Plane): boolean {
  const { territory, bodies, obstacles, narrow } = input;
  /* Half the clearance the relaxation keeps: a layout it settled passes, and a spot the repair finds still keeps a gap. */
  const radius = bodies[i]!.radius + GAP / 2;
  const apart = (other: Plane, otherRadius: number) =>
    Math.hypot(point[0] - other[0], point[1] - other[1]) >= radius + otherRadius;
  return (
    bodies.every((other, j) => j === i || apart(at[j]!, other.radius)) &&
    obstacles.every((obstacle) => standoff(point, obstacle, i).clear >= radius) &&
    fitsInside(territory, point, reachOf(input, bodies[i]!.radius) + GAP / 2) &&
    (narrow || restsInside(territory, point, bodies[i]!.radius))
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
    const radius = input.bodies[i]!.radius;
    const inset = input.narrow ? narrowInset(input.territory, radius) : undefined;
    const spot = nearestClearSpot(input.territory, radius, inset, at[i]!, (point) => clearAt(input, at, i, point));
    if (spot) {
      at[i] = [spot[0], spot[1]];
    }
  });
  const fits = bodies.every((_, i) => clearAt(input, at, i, at[i]!));
  return fits ? new Map(bodies.map((body, i) => [body.id, at[i]! as Plane])) : null;
}

const SPOT_STEP = 0.04;
/* Every point of a territory a footprint of a given radius may rest at, kept per territory and radius, so a search only checks what is in the way. */
const restingSpotsBy = new WeakMap<TableTerritory, Map<string, Plane[]>>();

/* How far a point lies inside the territory's border; negative outside it. */
function roomAt(territory: TableTerritory, at: Plane): number {
  const distance = nearestBorder(territory, at).distance;
  return territoryContains(territory, at) ? distance : -distance;
}

/*
 * How much leeway a footprint of `radius` has at `at`, in table units: at least zero exactly where it may rest, its centre stepped in from the border and no more than 30% of it outside.
 * Both terms change no faster than the distance moved: room by definition, and the share outside by at most 2/(πr) per unit, as a moving circle sweeps at most its diameter.
 */
function leewayAt(territory: TableTerritory, at: Plane, radius: number, inset?: number): number {
  const room = roomAt(territory, at) - ((inset ?? borderReach(radius)) + GAP / 2);
  if (room < 0 || inset !== undefined) {
    return room;
  }
  return Math.min(room, ((MOST_OUTSIDE - shareOutside(territory, at, radius)) * Math.PI * radius) / 2);
}

const CLIMB_DIRECTIONS = Array.from({ length: 8 }, (_, k): Plane => [
  Math.cos((k * Math.PI) / 4),
  Math.sin((k * Math.PI) / 4),
]);
const CLIMB_ROUNDS = 24;
/* Steps halve from half the grid's spacing down to well under a millimetre of table. */
const CLIMB_HALVINGS = 9;

type Climb = { at: Plane; leeway: number };

/*
 * A point near `start` where the footprint may rest, found by stepping towards more leeway in ever smaller steps, or null when there is none nearby.
 * A pocket narrower than the grid lies between grid points; climbing from the nearest of them finds it.
 */
function climbToRest(leeway: (at: Plane) => number, start: Plane): Plane | null {
  let best: Climb = { at: start, leeway: leeway(start) };
  for (let halving = 1; halving <= CLIMB_HALVINGS && best.leeway < 0; halving += 1) {
    best = climbAtStep(leeway, best, SPOT_STEP / 2 ** halving);
  }
  return best.leeway >= 0 ? best.at : null;
}

/* Steps of one length towards more leeway, until there is enough or no step gains any. */
function climbAtStep(leeway: (at: Plane) => number, from: Climb, step: number): Climb {
  let current = from;
  for (let round = 0; round < CLIMB_ROUNDS && current.leeway < 0; round += 1) {
    const next = bestStep(leeway, current, step);
    if (next === current) {
      break;
    }
    current = next;
  }
  return current;
}

/* The step of this length with the most leeway, or `from` itself when none has more. */
function bestStep(leeway: (at: Plane) => number, from: Climb, step: number): Climb {
  let best = from;
  for (const [dx, dz] of CLIMB_DIRECTIONS) {
    const at: Plane = [from.at[0] + dx * step, from.at[1] + dz * step];
    const value = leeway(at);
    if (value > best.leeway) {
      best = { at, leeway: value };
    }
  }
  return best;
}

/**
 * The points a footprint of `radius` may rest at in the territory: one for each point of a grid over it, a step apart, that has leeway or is within a step of having it.
 * Leeway changes no faster than the distance moved, so no place a footprint may rest lies farther than a step from such a grid point, whether the border's distance or the share over it is what limits it.
 */
function restingSpots(territory: TableTerritory, radius: number, inset?: number): Plane[] {
  const key = `${Math.round(radius * 1000)}:${inset === undefined ? '' : Math.round(inset * 1e6)}`;
  let byRadius = restingSpotsBy.get(territory);
  if (!byRadius) {
    byRadius = new Map();
    restingSpotsBy.set(territory, byRadius);
  }
  const known = byRadius.get(key);
  if (known) {
    return known;
  }
  const leeway = (at: Plane) => leewayAt(territory, at, radius, inset);
  const { minX, maxX, minZ, maxZ } = territoryBounds(territory);
  const spots: Plane[] = [];
  const columns = Math.ceil((maxX - minX) / SPOT_STEP);
  const rows = Math.ceil((maxZ - minZ) / SPOT_STEP);
  for (let column = 0; column < columns; column += 1) {
    for (let row = 0; row < rows; row += 1) {
      const at: Plane = [minX + (column + 0.5) * SPOT_STEP, minZ + (row + 0.5) * SPOT_STEP];
      const value = leeway(at);
      const spot = value >= 0 ? at : value >= -SPOT_STEP && climbToRest(leeway, at);
      if (spot && (inset !== undefined || restsInside(territory, spot, radius))) {
        spots.push(spot);
      }
    }
  }
  byRadius.set(key, spots);
  return spots;
}

/** The box a territory's outline fits in, in table x and z. */
export function territoryBounds(territory: TableTerritory) {
  const points = territory.rings.flat();
  return {
    minX: Math.min(...points.map(([x]) => x)),
    maxX: Math.max(...points.map(([x]) => x)),
    minZ: Math.min(...points.map(([, z]) => z)),
    maxZ: Math.max(...points.map(([, z]) => z)),
  };
}

/*
 * The free spot nearest `from` for a footprint of `radius`: every spot it may rest at in the territory, nearest first, until one is clear of everything in the way.
 * The grid covers the whole territory, so a pocket a stack fits in is never skipped, and the work is bounded by the territory's size.
 */
function nearestClearSpot(
  territory: TableTerritory,
  radius: number,
  inset: number | undefined,
  from: Plane,
  clear: (point: Plane) => boolean
): Plane | null {
  const distance = (point: Plane) => (point[0] - from[0]) ** 2 + (point[1] - from[1]) ** 2;
  const nearestFirst = [...restingSpots(territory, radius, inset)].sort((a, b) => distance(a) - distance(b));
  return nearestFirst.find(clear) ?? null;
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

/*
 * Sectors: the storm's sector lines run from the board's centre to its rim and split a territory into the parts a stack can rest in.
 * A stack keeps to one part, with no more of it over the line than over a border, so which sector it stands in is never in doubt.
 */

/** The sector a table point lies in, as the faction tokens and the storm count them. */
export function tableSectorAt([x, z]: Plane): number {
  return sectorIndexAt([x, 0, z]);
}

/* Keeps the part of a ring on the side of a line where `side` is at least zero; a ring cut in two keeps its pieces joined along the line, which is border anyway. */
function clipRing(ring: readonly Plane[], side: (point: Plane) => number): Plane[] {
  const result: Plane[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) {
      result.push(a);
    }
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

function ringArea(ring: readonly Plane[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
  }
  return Math.abs(area) / 2;
}

/* The part of a territory within sector `index`; undefined when nothing of it is left. */
function sectorPart(territory: TableTerritory, index: number): TableTerritory | undefined {
  const from = index * STORM_SECTOR_ANGLE;
  const to = from + STORM_SECTOR_ANGLE;
  /* Signed distances from the two lines, positive on the sector's side. */
  const afterFrom = ([x, z]: Plane) => Math.cos(from) * z - Math.sin(from) * x;
  const beforeTo = ([x, z]: Plane) => Math.sin(to) * x - Math.cos(to) * z;
  /* Each piece keeps its ring's depth from the whole outline: a clipped hole can touch the outer ring on the line, and would read as land if counted afresh. */
  const depths = depthsOf(territory.rings);
  const pieces = territory.rings
    .map((ring, ringIndex) => ({ ring: clipRing(clipRing(ring, afterFrom), beforeTo), depth: depths[ringIndex]! }))
    .filter(({ ring }) => ring.length >= 3 && ringArea(ring) > 1e-6);
  if (pieces.length === 0) {
    return undefined;
  }
  const rings = pieces.map(({ ring }) => ring);
  ringDepths.set(
    rings,
    pieces.map(({ depth }) => depth)
  );
  return { id: `${territory.id}@${index}`, name: territory.name, rings, sectored: false };
}

const sectorParts = new WeakMap<TableTerritory, (TableTerritory | undefined)[]>();

/* Cached per territory, so the packing's grids of roomy spots are kept too. */
function partsOf(territory: TableTerritory): (TableTerritory | undefined)[] {
  let parts = sectorParts.get(territory);
  if (!parts) {
    parts = Array.from({ length: TABLE_SECTOR_COUNT }, (_, index) => sectorPart(territory, index));
    sectorParts.set(territory, parts);
  }
  return parts;
}

/*
 * A sector line that grazes a territory's outline can leave a sliver of it on the far side, far smaller than any piece: no sector of the board's own.
 * A stack let go there rests in the territory's nearest real sector instead.
 */
const SLIVER_AREA = 0.01;

function isSliver(part: TableTerritory): boolean {
  const depths = depthsOf(part.rings);
  const area = part.rings.reduce((sum, ring, index) => sum + (depths[index]! % 2 === 0 ? 1 : -1) * ringArea(ring), 0);
  return area < SLIVER_AREA;
}

/**
 * The part of a territory a stack let go at `at` rests in: the stretch of it within the sector it was let go in, however narrow.
 * A territory the sector lines do not divide is its own single part.
 */
export function restingPart(territory: TableTerritory, at: Plane): TableTerritory {
  if (!territory.sectored) {
    return territory;
  }
  const parts = partsOf(territory).filter((part): part is TableTerritory => !!part && !isSliver(part));
  const home = parts.find((part) => part.id === `${territory.id}@${tableSectorAt(at)}`);
  if (home || parts.length === 0) {
    return home ?? territory;
  }
  const distance = (part: TableTerritory) => (territoryContains(part, at) ? 0 : nearestBorder(part, at).distance);
  return parts.reduce((best, part) => (distance(part) < distance(best) ? part : best), parts[0]!);
}

const roomiest = new WeakMap<TableTerritory, number>();

/* How far the point of a part furthest from its border lies from it. */
function deepestRoom(part: TableTerritory): number {
  let room = roomiest.get(part);
  if (room === undefined) {
    room = Math.max(0, roomAt(part, innermostPoint(part, 0.01)));
    roomiest.set(part, room);
  }
  return room;
}

/**
 * How far inside the border of a part too narrow or too full for the usual rule a stack's centre keeps: as far as a roomy part keeps it, or two fifths of the part's own depth where it is narrower.
 * Its centre then always stands in the part, so which sector the stack stands in is never in doubt, however much of it hangs over.
 */
export function narrowInset(part: TableTerritory, radius: number): number {
  return Math.min(borderReach(radius), Math.max(0, deepestRoom(part) * 0.4 - GAP / 2));
}

/** Whether a stack with a footprint of `radius` rests at `at` in a part by the narrow rule: its centre as far inside as the packing keeps it there. */
export function restsNarrowly(part: TableTerritory, at: Plane, radius: number): boolean {
  return fitsInside(part, at, narrowInset(part, radius) + GAP / 2);
}

/**
 * Whether a stack with a footprint of `radius` may rest at `at` in a part: as the usual rule allows, or, in a part too narrow to hold it that way anywhere, by the narrow rule.
 */
export function restsInPart(part: TableTerritory, at: Plane, radius: number): boolean {
  return restsInside(part, at, radius) || (restingSpots(part, radius).length === 0 && restsNarrowly(part, at, radius));
}

/* How much of the combined reach of two round footprints this far apart overlaps; a stack keeps at least 30% of their combined reach from another, so both still show. */
const MOST_OVERLAP = 0.7;

/**
 * Where a stack with a footprint of `radius` let go at `from` rests in a part with no room left clear of the stacks already there: overlapping them as little as it can, those of other sectors least of all, nearest `from` among the spots that overlap least.
 * It keeps its centre as far inside the part as a narrow part allows, clear of the pieces in the way that are not stacks, and stays at least 30% of their combined reach from any stack;
 * null when no such spot is left.
 */
export function overlappingSpot(
  part: TableTerritory,
  radius: number,
  from: Plane,
  stacks: readonly (FitBody & { elsewhere?: boolean })[],
  obstacles: readonly FitObstacle[]
): Plane | null {
  const inset = narrowInset(part, radius);
  /* Covering a stack of another sector or territory counts double, so the stacks of the sector's own are covered first. */
  const overlap = (point: Plane) =>
    Math.max(
      0,
      ...stacks.map(
        (stack) =>
          (stack.radius + radius - Math.hypot(point[0] - stack.at[0], point[1] - stack.at[1])) *
          (stack.elsewhere ? 2 : 1)
      )
    );
  const allowed = (point: Plane) =>
    fitsInside(part, point, inset) &&
    obstacles.every((obstacle, index) => standoff(point, obstacle, index).clear >= radius + GAP / 2) &&
    stacks.every(
      (stack) =>
        Math.hypot(point[0] - stack.at[0], point[1] - stack.at[1]) >= (stack.radius + radius) * (1 - MOST_OVERLAP)
    );
  /* Between grid points a gap the floor allows can hide, so each spot's neighbours half a step away are tried too. */
  const near = (point: Plane): Plane[] => [
    point,
    ...CLIMB_DIRECTIONS.map(([dx, dz]): Plane => [point[0] + (dx * SPOT_STEP) / 2, point[1] + (dz * SPOT_STEP) / 2]),
  ];
  /* The grid's own clearance is half a gap, so it is asked for half a gap less: a spot the overlap allows by its centre alone is on it too. */
  const candidates = [from, ...restingSpots(part, radius, inset - GAP / 2).flatMap(near)].filter(allowed);
  const distance = (point: Plane) => Math.hypot(point[0] - from[0], point[1] - from[1]);
  /* Overlaps within a step of the grid count as equal, so the nearest of the spots that overlap least wins. */
  const score = (point: Plane) => Math.round(overlap(point) / SPOT_STEP);
  let best: Plane | null = null;
  for (const candidate of candidates) {
    if (
      !best ||
      score(candidate) < score(best) ||
      (score(candidate) === score(best) && distance(candidate) < distance(best))
    ) {
      best = candidate;
    }
  }
  return best;
}
