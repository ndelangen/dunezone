import { describe, expect, test } from 'vite-plus/test';

import { ARROW_GAP_PX, guideShapePath, keepInView, transposed } from './guideArrow';

const band = { left: 0, right: 1440, bottom: 72 };
const numbers = (path: string) => path.match(/-?\d+(\.\d+)?/g)!.map(Number);
/* The points of the outline below the band's edge: the arrow's, since the band itself ends at the edge. */
const below = (path: string) => {
  const values = numbers(path);
  const points = [];
  for (let index = 0; index + 1 < values.length; index += 2) {
    points.push({ x: values[index]!, y: values[index + 1]! });
  }
  return points.filter((point) => point.y > band.bottom);
};

describe('guideShapePath', () => {
  test('draws only the band without a target', () => {
    expect(below(guideShapePath(band, { x: 400, y: 72 }, null))).toEqual([]);
  });

  test('stops the wedge short of the target edge', () => {
    const target = { x: 700, y: 500, halfWidth: 40, halfHeight: 40 };
    const lowest = Math.max(...below(guideShapePath(band, { x: 700, y: 72 }, target)).map((point) => point.y));
    expect(lowest).toBeCloseTo(target.y - target.halfHeight - ARROW_GAP_PX, 0);
  });

  /* A field met near its corner at a slant: the barbs, not just the tip, keep their gap, so a label at the field's edge stays clear. */
  test('keeps the whole arrowhead clear of a target it meets at a slant', () => {
    const target = { x: 760, y: 420, halfWidth: 110, halfHeight: 46 };
    for (const rootX of [120, 260, 400, 520]) {
      const points = below(guideShapePath(band, { x: rootX, y: 72 }, target));
      expect(points.length).toBeGreaterThan(0);
      for (const point of points) {
        const clear =
          Math.abs(point.x - target.x) >= target.halfWidth + ARROW_GAP_PX - 0.5 ||
          Math.abs(point.y - target.y) >= target.halfHeight + ARROW_GAP_PX - 0.5;
        expect(clear, `${rootX}: ${point.x} ${point.y}`).toBe(true);
      }
    }
  });

  test('hooks across at a target right under the band, from the side with room', () => {
    const target = { x: 1277, y: 109, halfWidth: 57, halfHeight: 18 };
    const right = below(guideShapePath(band, { x: 1277, y: 72 }, target));
    expect(right.length).toBeGreaterThan(0);
    expect(Math.max(...right.map((point) => point.x))).toBeLessThan(target.x - target.halfWidth);
    const nearLeft = { ...target, x: 80 };
    const left = below(guideShapePath(band, { x: 80, y: 72 }, nearLeft));
    expect(Math.min(...left.map((point) => point.x))).toBeGreaterThan(nearLeft.x + nearLeft.halfWidth);
  });

  test('never writes a coordinate that is not a number', () => {
    for (const target of [
      { x: 400, y: 72, halfWidth: 0, halfHeight: 0 },
      { x: 400, y: 73, halfWidth: 0, halfHeight: 0 },
      { x: 1400, y: 80, halfWidth: 30, halfHeight: 10 },
    ]) {
      expect(guideShapePath(band, { x: 400, y: 72 }, target)).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe('keepInView', () => {
  const view = { left: 0, top: 100, right: 1000, bottom: 700 };

  test('keeps a target in view where it is', () => {
    const target = { x: 300, y: 400, halfWidth: 20, halfHeight: 20 };
    expect(keepInView(target, view)).toBe(target);
  });

  /* 40 px in from the edge (Norbert, 2026-10-24), written out so a changed inset fails here. */
  test('moves a target off the right edge onto it, the way it lies', () => {
    const moved = keepInView({ x: 3000, y: 400, halfWidth: 20, halfHeight: 20 }, view);
    expect(moved).toEqual({ x: 960, y: 400, halfWidth: 0, halfHeight: 0 });
  });

  test('moves a target off a corner along the line from the middle', () => {
    const moved = keepInView({ x: 1500, y: 1400, halfWidth: 0, halfHeight: 0 }, view);
    expect(moved.y).toBeCloseTo(660);
    /* From the middle (500, 400) the target lies 1000 across for 1000 down. */
    expect(moved.x - 500).toBeCloseTo(moved.y - 400);
  });
});

test('a transposed outline swaps every point across the diagonal, curves included', () => {
  expect(transposed('M -4.0 10.5 L 20.0 30.0 Q 1.0 2.0 3.0 4.0 Z')).toBe('M 10.5 -4.0 L 30.0 20.0 Q 2.0 1.0 4.0 3.0 Z');
});
