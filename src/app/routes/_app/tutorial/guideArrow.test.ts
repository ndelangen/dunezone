import { describe, expect, test } from 'vite-plus/test';

import { ARROW_GAP_PX, guideShapePath } from './guideArrow';

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
