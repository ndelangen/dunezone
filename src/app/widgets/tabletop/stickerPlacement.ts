type Point = readonly [number, number];

/* How far a sticker's centre must stay from the territory's edge, per unit of its size: about half its diagonal. */
const CLEARANCE_PER_SIZE = 0.6;
/* Sample points across the territory's longer side; enough to find the roomy spots of the Shield Wall's thin band. */
const SAMPLES = 40;

function segmentDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point) {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Whether the point lies inside the rings, holes left out (even-odd). */
function inside([px, py]: Point, rings: readonly (readonly Point[])[]) {
  let crossings = 0;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[j];
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
        crossings++;
      }
    }
  }
  return crossings % 2 === 1;
}

function edgeDistance(point: Point, rings: readonly (readonly Point[])[]) {
  let nearest = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      nearest = Math.min(nearest, segmentDistance(point, ring[i], ring[i + 1]));
    }
  }
  return nearest;
}

/** Points inside the territory, each with how far it is from the nearest edge. */
function roomyPoints(rings: readonly (readonly Point[])[]) {
  const xs = rings[0].map(([x]) => x);
  const ys = rings[0].map(([, y]) => y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const step = Math.max(maxX - minX, maxY - minY) / SAMPLES;
  const points: { at: Point; room: number }[] = [];
  for (let x = minX + step / 2; x < maxX; x += step) {
    for (let y = minY + step / 2; y < maxY; y += step) {
      const at: Point = [x, y];
      if (inside(at, rings)) {
        points.push({ at, room: edgeDistance(at, rings) });
      }
    }
  }
  return points;
}

/** The room a point keeps from the edge and from the stickers already placed, which each need as much again. */
function roomAmong(point: { at: Point; room: number }, placed: readonly Point[]) {
  return placed.reduce((room, [x, y]) => Math.min(room, Math.hypot(point.at[0] - x, point.at[1] - y) / 2), point.room);
}

/** The point with the most room left among the stickers already placed, and that room. */
function roomiest(points: readonly { at: Point; room: number }[], placed: readonly Point[]) {
  let best = { at: points[0].at, room: roomAmong(points[0], placed) };
  for (const point of points) {
    const room = roomAmong(point, placed);
    if (room > best.room) {
      best = { at: point.at, room };
    }
  }
  return best;
}

/**
 * Where a territory's stickers go and how large they are: each in turn takes the roomiest spot left, away from the edges and the stickers before it, so a long band lines them up along its length and a round one clusters them in the middle.
 * They are as large as the tightest spot allows, up to `largest`.
 */
export function placeStickers(rings: readonly (readonly Point[])[], count: number, largest: number) {
  const points = roomyPoints(rings);
  const placed: Point[] = [];
  let room = Infinity;
  for (let index = 0; index < count && points.length; index++) {
    const best = roomiest(points, placed);
    room = Math.min(room, best.room);
    placed.push(best.at);
  }
  return { at: placed, size: Math.min(largest, room / CLEARANCE_PER_SIZE) };
}
