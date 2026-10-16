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

/** Segments joined end to end into lines, so each bend can be drawn as a join; a line breaks where more than two segments meet. */
export function outlinePaths(segments: readonly Segment[]): OutlinePath[] {
  const atPoint = new Map<string, number[]>();
  segments.forEach((segment, index) => {
    for (const point of segment) {
      const key = pointKey(point);
      atPoint.set(key, [...(atPoint.get(key) ?? []), index]);
    }
  });
  const used = new Set<number>();
  const isJunction = (point: Point) => atPoint.get(pointKey(point))!.length !== 2;
  const walk = (start: Point): OutlinePath => {
    const points = [start];
    let at = start;
    for (;;) {
      const next = atPoint.get(pointKey(at))!.find((index) => !used.has(index));
      if (next === undefined) {
        break;
      }
      used.add(next);
      const [a, b] = segments[next];
      at = pointKey(a) === pointKey(at) ? b : a;
      points.push(at);
      if (isJunction(at)) {
        break;
      }
    }
    const closed = points.length > 2 && pointKey(points[0]) === pointKey(at) && !isJunction(at);
    return { points: closed ? points.slice(0, -1) : points, closed };
  };
  const paths: OutlinePath[] = [];
  const starts = [...segments.flat().filter(isJunction), ...segments.map(([a]) => a)];
  for (const start of starts) {
    while (atPoint.get(pointKey(start))!.some((index) => !used.has(index))) {
      paths.push(walk(start));
    }
  }
  return paths;
}

/** A line moved sideways by a distance, its corners mitred so the moved segments meet without gaps or overlaps. */
export function offsetPath({ points, closed }: OutlinePath, distance: number, miterLimit = 4): Point[] {
  const count = points.length;
  const normal = (a: Point, b: Point): Point => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
  };
  return points.map((point, i) => {
    const previous = i > 0 ? points[i - 1] : closed ? points[count - 1] : undefined;
    const next = i < count - 1 ? points[i + 1] : closed ? points[0] : undefined;
    const before = previous && normal(previous, point);
    const after = next && normal(point, next);
    const [nx, ny] = before && after ? [before[0] + after[0], before[1] + after[1]] : (before ?? after)!;
    const along = Math.hypot(nx, ny) || 1;
    const [ux, uy] = [nx / along, ny / along];
    const cos = before && after ? ux * before[0] + uy * before[1] : 1;
    const reach = distance / Math.max(cos, 1 / miterLimit);
    return [point[0] + ux * reach, point[1] + uy * reach];
  });
}
