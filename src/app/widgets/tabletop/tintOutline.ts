type Point = readonly [number, number];
type Segment = readonly [Point, Point];

/* Neighbouring territories trace their shared border through the same points; this rounding absorbs float noise. */
const pointKey = ([x, y]: Point) => `${x.toFixed(3)},${y.toFixed(3)}`;
function segmentKey(a: Point, b: Point) {
  const [from, to] = [pointKey(a), pointKey(b)];
  return from < to ? `${from}|${to}` : `${to}|${from}`;
}

/** The edges round a group of territories taken as one shape: every border segment but those two of them share. */
export function outerSegments(territories: readonly (readonly (readonly Point[])[])[]): Segment[] {
  const segments = new Map<string, { segment: Segment; count: number }>();
  for (const rings of territories) {
    for (const ring of rings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const key = segmentKey(ring[i], ring[i + 1]);
        const seen = segments.get(key);
        if (seen) {
          seen.count++;
        } else {
          segments.set(key, { segment: [ring[i], ring[i + 1]], count: 1 });
        }
      }
    }
  }
  return [...segments.values()].filter(({ count }) => count === 1).map(({ segment }) => segment);
}

export type OutlinePath = { points: Point[]; closed: boolean };

type Joins = Map<string, number[]>;

function segmentsAtPoints(segments: readonly Segment[]): Joins {
  const atPoint: Joins = new Map();
  segments.forEach((segment, index) => {
    for (const point of segment) {
      const key = pointKey(point);
      atPoint.set(key, [...(atPoint.get(key) ?? []), index]);
    }
  });
  return atPoint;
}

/* Where a line must stop: an open end, or a point more than two segments meet at. */
const isJunction = (atPoint: Joins, point: Point) => atPoint.get(pointKey(point))!.length !== 2;

function otherEnd([a, b]: Segment, at: Point) {
  return pointKey(a) === pointKey(at) ? b : a;
}

/** Follows unused segments from a point until the line ends, meets a junction or comes back round. */
function walk(segments: readonly Segment[], atPoint: Joins, used: Set<number>, start: Point): OutlinePath {
  const points = [start];
  let at = start;
  let next = atPoint.get(pointKey(at))!.find((index) => !used.has(index));
  while (next !== undefined) {
    used.add(next);
    at = otherEnd(segments[next], at);
    points.push(at);
    next = isJunction(atPoint, at) ? undefined : atPoint.get(pointKey(at))!.find((index) => !used.has(index));
  }
  const closed = points.length > 2 && pointKey(points[0]) === pointKey(at) && !isJunction(atPoint, at);
  return { points: closed ? points.slice(0, -1) : points, closed };
}

/** Segments joined end to end into lines, so each bend can be drawn as a join; a line breaks where more than two segments meet. */
export function outlinePaths(segments: readonly Segment[]): OutlinePath[] {
  const atPoint = segmentsAtPoints(segments);
  const used = new Set<number>();
  const hasUnused = (point: Point) => atPoint.get(pointKey(point))!.some((index) => !used.has(index));
  const starts = [...segments.flat().filter((point) => isJunction(atPoint, point)), ...segments.map(([a]) => a)];
  const paths: OutlinePath[] = [];
  for (const start of starts) {
    while (hasUnused(start)) {
      paths.push(walk(segments, atPoint, used, start));
    }
  }
  return paths;
}

function unitNormal(a: Point, b: Point): Point {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
}

function neighbour({ points, closed }: OutlinePath, index: number): Point | undefined {
  if (index >= 0 && index < points.length) {
    return points[index];
  }
  return closed ? points[(index + points.length) % points.length] : undefined;
}

/** Which way, and how far per unit of offset, a corner moves so the sides either side of it stay parallel. */
function miter(before: Point | undefined, after: Point | undefined, miterLimit: number) {
  if (!before || !after) {
    return { direction: (before ?? after)!, reach: 1 };
  }
  const [nx, ny] = [before[0] + after[0], before[1] + after[1]];
  const length = Math.hypot(nx, ny) || 1;
  const direction: Point = [nx / length, ny / length];
  const cos = direction[0] * before[0] + direction[1] * before[1];
  return { direction, reach: 1 / Math.max(cos, 1 / miterLimit) };
}

/** A line moved sideways by a distance, its corners mitred so the moved segments meet without gaps or overlaps. */
export function offsetPath(path: OutlinePath, distance: number, miterLimit = 4): Point[] {
  return path.points.map((point, i) => {
    const previous = neighbour(path, i - 1);
    const next = neighbour(path, i + 1);
    const { direction, reach } = miter(
      previous && unitNormal(previous, point),
      next && unitNormal(point, next),
      miterLimit
    );
    return [point[0] + direction[0] * reach * distance, point[1] + direction[1] * reach * distance];
  });
}
