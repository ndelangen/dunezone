import type { Vector3Tuple } from './model';
import { TABLE_VISIBLE_RADIUS } from './tableGeometry';

/** A point on the table as [x, z]. */
export type PlanePoint = readonly [x: number, z: number];

/*
 * The shelf below the board holds the Tleilaxu Tanks and the shared item slots (#2675).
 * The Tanks are a pad that curves round the table under the bottom seat, so the seat's own area ends at the table's edge and the
 * pad starts a clear gap beyond it. The pad is drawn like a card well: a flat rim and a recessed face, with rounded corners.
 * The shelf follows the pad a margin outside it, then narrows to a column under the pad that holds the shared item slots.
 */
export const TANKS_PAD = {
  innerRadius: 5.85,
  outerRadius: 9.45,
  /* Either side of straight down, in radians. */
  halfAngle: 0.5,
  cornerRadius: 0.35,
} as const;

const SHELF_MARGIN = 0.4;
const SHELF_CORNER_RADIUS = 0.32;
const SHELF_JOIN_RADIUS = 0.18;
/** Half the width of the shelf's column under the pad, which holds the shared item slots. */
export const SHARED_COLUMN_HALF_WIDTH = 2.35;
/** The first row of shared item slots, in the column under the pad. */
export const SHARED_ITEMS_FIRST_ROW_Z = 10.4;
const SHELF_MAX_Z = 12.7;

const DOWN = Math.PI / 2;
const ARC_SAMPLES_PER_RADIAN = 40;

function polar(radius: number, angle: number): PlanePoint {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

/*
 * Where a side of the pad, grown outward by `grow`, meets a circle about the table's centre. The pad's sides run along the radii
 * at `DOWN ± halfAngle`; grown, each side is the same radius moved `grow` outward, so the margin stays even along it.
 */
function sidePoint(side: 1 | -1, radius: number, grow: number): PlanePoint {
  const angle = DOWN - side * TANKS_PAD.halfAngle;
  const along = Math.sqrt(Math.max(0, radius * radius - grow * grow));
  /* Outward from the pad: toward the smaller angle on the right side (side 1), the larger on the left. */
  const normal: PlanePoint = [side * Math.sin(angle), -side * Math.cos(angle)];
  return [Math.cos(angle) * along + normal[0] * grow, Math.sin(angle) * along + normal[1] * grow];
}

function angleOf([x, z]: PlanePoint): number {
  return Math.atan2(z, x);
}

/** Points along an arc about the table's centre, both ends included. */
function arc(radius: number, from: number, to: number): PlanePoint[] {
  const samples = Math.max(2, Math.ceil(Math.abs(to - from) * ARC_SAMPLES_PER_RADIAN));
  return Array.from({ length: samples + 1 }, (_, index) => polar(radius, from + ((to - from) * index) / samples));
}

type Corner = Readonly<{ index: number; radius: number }>;

/**
 * Rounds the given vertices of an open polyline: each corner's path is cut `radius` back along the line on either side and the gap bridged with a quadratic curve whose control point is the corner, the way the table plate rounds its joins.
 */
function roundCorners(points: readonly PlanePoint[], corners: readonly Corner[]): PlanePoint[] {
  const lengths = [0];
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1]!;
    const [bx, bz] = points[index]!;
    lengths.push(lengths[index - 1]! + Math.hypot(bx - ax, bz - az));
  }
  const pointAt = (distance: number): PlanePoint => {
    const segment = Math.max(
      1,
      lengths.findIndex((length) => length >= distance)
    );
    const [ax, az] = points[segment - 1]!;
    const [bx, bz] = points[segment]!;
    const span = lengths[segment]! - lengths[segment - 1]!;
    const t = span === 0 ? 0 : (distance - lengths[segment - 1]!) / span;
    return [ax + (bx - ax) * t, az + (bz - az) * t];
  };
  const cuts = corners
    .map(({ index, radius }) => ({ index, from: lengths[index]! - radius, to: lengths[index]! + radius }))
    .sort((a, b) => a.from - b.from);
  const result: PlanePoint[] = [];
  let cut = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = cuts[cut];
    if (current && lengths[index]! >= current.from) {
      const start = pointAt(current.from);
      const end = pointAt(current.to);
      const [cx, cz] = points[current.index]!;
      for (let step = 0; step <= 8; step += 1) {
        const t = step / 8;
        const a = (1 - t) * (1 - t);
        const b = 2 * (1 - t) * t;
        const c = t * t;
        result.push([a * start[0] + b * cx + c * end[0], a * start[1] + b * cz + c * end[1]]);
      }
      while (index + 1 < points.length && lengths[index + 1]! <= current.to) {
        index += 1;
      }
      cut += 1;
      continue;
    }
    result.push(points[index]!);
  }
  return result;
}

/**
 * The Tanks pad's outline as a closed loop, grown outward by `grow` (the rim of a card well is its face grown a little).
 * It starts and ends at the middle of the outer edge, so every corner lies inside the run and is rounded.
 */
export function tanksPadOutline(grow = 0): PlanePoint[] {
  const inner = TANKS_PAD.innerRadius - grow;
  const outer = TANKS_PAD.outerRadius + grow;
  const outerRight = sidePoint(1, outer, grow);
  const innerRight = sidePoint(1, inner, grow);
  const innerLeft = sidePoint(-1, inner, grow);
  const outerLeft = sidePoint(-1, outer, grow);
  const right = arc(outer, DOWN, angleOf(outerRight));
  const bottom = arc(inner, angleOf(innerRight), angleOf(innerLeft));
  const left = arc(outer, angleOf(outerLeft), DOWN);
  const points = [...right, ...bottom, ...left];
  const radius = TANKS_PAD.cornerRadius + grow;
  const corners = [right.length - 1, right.length, right.length + bottom.length - 1, right.length + bottom.length].map(
    (index) => ({ index, radius })
  );
  return roundCorners(points, corners).slice(0, -1);
}

/*
 * How far the plate's join with the round table reaches along the table's edge, as the side shelves' joins do.
 */
const JOIN_LEAD = 0.2;

/**
 * The shelf's edge from where it leaves the round table on the right to where it rejoins it on the left, with the angle it leaves and rejoins the table's edge at.
 * The table plate draws the round edge up to `startAngle` and on from `endAngle`.
 */
function bottomShelfEdge(): { points: PlanePoint[]; startAngle: number; endAngle: number } {
  const radius = TABLE_VISIBLE_RADIUS;
  const outer = TANKS_PAD.outerRadius + SHELF_MARGIN;
  const joinRight = sidePoint(1, radius, SHELF_MARGIN);
  const joinLeft = sidePoint(-1, radius, SHELF_MARGIN);
  const startAngle = angleOf(joinRight) - JOIN_LEAD / radius;
  const endAngle = angleOf(joinLeft) + JOIN_LEAD / radius;
  const shoulderRight = sidePoint(1, outer, SHELF_MARGIN);
  const shoulderLeft = sidePoint(-1, outer, SHELF_MARGIN);
  const columnZ = Math.sqrt(outer * outer - SHARED_COLUMN_HALF_WIDTH * SHARED_COLUMN_HALF_WIDTH);
  const neckRight: PlanePoint = [SHARED_COLUMN_HALF_WIDTH, columnZ];
  const neckLeft: PlanePoint = [-SHARED_COLUMN_HALF_WIDTH, columnZ];
  const footRight: PlanePoint = [SHARED_COLUMN_HALF_WIDTH, SHELF_MAX_Z];
  const footLeft: PlanePoint = [-SHARED_COLUMN_HALF_WIDTH, SHELF_MAX_Z];
  const sweepRight = arc(outer, angleOf(shoulderRight), angleOf(neckRight));
  const sweepLeft = arc(outer, angleOf(neckLeft), angleOf(shoulderLeft));
  const points: PlanePoint[] = [
    polar(radius, startAngle),
    joinRight,
    ...sweepRight,
    footRight,
    footLeft,
    ...sweepLeft,
    joinLeft,
    polar(radius, endAngle),
  ];
  const index = (point: PlanePoint) => points.indexOf(point);
  const shoulderRadius = TANKS_PAD.cornerRadius + SHELF_MARGIN;
  return {
    points: roundCorners(points, [
      { index: index(joinRight), radius: SHELF_JOIN_RADIUS },
      { index: index(sweepRight[0]!), radius: shoulderRadius },
      { index: index(sweepRight.at(-1)!), radius: SHELF_JOIN_RADIUS },
      { index: index(footRight), radius: SHELF_CORNER_RADIUS },
      { index: index(footLeft), radius: SHELF_CORNER_RADIUS },
      { index: index(sweepLeft[0]!), radius: SHELF_JOIN_RADIUS },
      { index: index(sweepLeft.at(-1)!), radius: shoulderRadius },
      { index: index(joinLeft), radius: SHELF_JOIN_RADIUS },
    ]),
    startAngle,
    endAngle,
  };
}

/** The bottom shelf's edge, computed once: the plate draws it, and physics, the camera and pings read it. */
export const BOTTOM_SHELF_EDGE = bottomShelfEdge();

/** The bottom shelf's extent on the table. */
export const BOTTOM_SHELF_BOUNDS = {
  minX: Math.min(...BOTTOM_SHELF_EDGE.points.map(([x]) => x)),
  maxX: Math.max(...BOTTOM_SHELF_EDGE.points.map(([x]) => x)),
  minZ: Math.min(...BOTTOM_SHELF_EDGE.points.map(([, z]) => z)),
  maxZ: Math.max(...BOTTOM_SHELF_EDGE.points.map(([, z]) => z)),
} as const;

function polygonContains(polygon: readonly PlanePoint[], x: number, z: number): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [ax, az] = polygon[index]!;
    const [bx, bz] = polygon[previous]!;
    if (az > z !== bz > z && x < ax + ((z - az) * (bx - ax)) / (bz - az)) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether a table point lies over the bottom shelf: its edge, closed by the chord across the round table it starts and ends on. */
export function isOnBottomShelf(x: number, z: number): boolean {
  return polygonContains(BOTTOM_SHELF_EDGE.points, x, z);
}

const TANKS_CATCHMENT = tanksPadOutline(SHELF_MARGIN / 2);

/** Whether a piece at this position is in the Tleilaxu Tanks: on the pad, or on the shelf's margin just round it. */
export function isInTanks(position: Readonly<Vector3Tuple>): boolean {
  return polygonContains(TANKS_CATCHMENT, position[0], position[2]);
}

/** The point on the bottom shelf's edge nearest a table point, with the direction into the shelf there. */
export function nearestBottomShelfEdge(x: number, z: number): { point: PlanePoint; inward: PlanePoint } {
  const points = BOTTOM_SHELF_EDGE.points;
  let best: { point: PlanePoint; inward: PlanePoint; distance: number } | null = null;
  for (let index = 1; index < points.length; index += 1) {
    const [ax, az] = points[index - 1]!;
    const [bx, bz] = points[index]!;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSquared));
    const point: PlanePoint = [ax + dx * t, az + dz * t];
    const distance = Math.hypot(point[0] - x, point[1] - z);
    if (!best || distance < best.distance) {
      const length = Math.sqrt(lengthSquared) || 1;
      /* The edge runs from the right round the bottom to the left, so the shelf lies a quarter turn back from its direction. */
      best = { point, inward: [-dz / length, dx / length], distance };
    }
  }
  return best!;
}
