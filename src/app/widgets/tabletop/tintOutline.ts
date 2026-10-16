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
