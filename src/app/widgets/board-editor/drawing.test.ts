import type { Point } from '@shared/boards/geometry';
import { describe, expect, test } from 'vite-plus/test';

import { drawingComplete, drawingEdge } from './drawing';

const placed = (...points: [string, Point][]) => points.map(([node, point]) => ({ node, point }));

/*
 * The board editor's drawing flow reaches these only through pointer clicks on the SVG, and its story checks no more than the edge kinds a save writes.
 * The arc flags are what decide which way a territory bulges, so they are pinned here against circles worked out by hand.
 */
/** The arc drawn through a, a bend and b, read as its radius and its large-arc and sweep flags. */
function arcThrough(bend: Point) {
  const edge = drawingEdge('arc', placed(['a', [0, 0]], ['m', bend], ['b', [2, 0]]));
  if (edge?.kind !== 'arc') {
    throw new Error('No arc was drawn');
  }
  if (!edge.arc) {
    throw new Error('The arc has no radius');
  }
  const [rx, ry, rotation, large, sweep] = edge.arc;
  expect([edge.a, edge.b, rx, rotation]).toEqual(['a', 'b', ry, 0]);
  return { radius: rx, large, sweep };
}

describe('a circular arc through three placed points', () => {
  test('a bend on a semicircle draws the circle through all three, as a minor arc', () => {
    const arc = arcThrough([1, 1]);
    expect(arc.radius).toBeCloseTo(1);
    expect([arc.large, arc.sweep]).toEqual([0, 0]);
  });

  test('a bend beyond the semicircle takes the large arc of the circumcircle', () => {
    const arc = arcThrough([1, 3]);
    expect(arc.radius).toBeCloseTo(5 / 3);
    expect([arc.large, arc.sweep]).toEqual([1, 0]);
  });

  test('a bend on the other side sweeps the other way', () => {
    const arc = arcThrough([1, -1]);
    expect(arc.radius).toBeCloseTo(1);
    expect([arc.large, arc.sweep]).toEqual([0, 1]);
  });

  test('a bend on the straight line between the ends has no circle and is refused', () => {
    expect(() => drawingEdge('arc', placed(['a', [0, 0]], ['m', [1, 0]], ['b', [2, 0]]))).toThrow(
      'Choose a bend away from the straight line'
    );
  });

  test('two points are not an arc yet', () => {
    expect(drawingEdge('arc', placed(['a', [0, 0]], ['m', [1, 1]]))).toBeNull();
    expect(drawingComplete('arc', placed(['a', [0, 0]], ['m', [1, 1]]))).toBe(false);
  });
});

describe('a cubic curve', () => {
  const four = placed(['a', [0, 0]], ['c1', [1, 2]], ['c2', [3, 2]], ['b', [4, 0]]);

  test('the middle two points are its control points and the outer two its ends', () => {
    expect(drawingEdge('cubic', four)).toMatchObject({ a: 'a', b: 'b', kind: 'cubic', c1: [1, 2], c2: [3, 2] });
    expect(drawingComplete('cubic', four)).toBe(true);
  });

  test('three points are not a curve yet', () => {
    expect(drawingEdge('cubic', four.slice(0, 3))).toBeNull();
    expect(drawingComplete('cubic', four.slice(0, 3))).toBe(false);
  });
});

describe('a line', () => {
  test('each point after the first cuts from the one before it', () => {
    expect(drawingEdge('line', placed(['a', [0, 0]], ['b', [1, 0]]))).toMatchObject({ a: 'a', b: 'b', kind: 'line' });
  });

  test('placing the same point twice cuts nothing', () => {
    expect(drawingEdge('line', placed(['a', [0, 0]], ['a', [0, 0]]))).toBeNull();
  });

  test('it finishes once it returns to its first point', () => {
    const open = placed(['a', [0, 0]], ['b', [1, 0]], ['c', [1, 1]]);
    expect(drawingComplete('line', open)).toBe(false);
    expect(drawingComplete('line', [...open, { node: 'a', point: [0, 0] }])).toBe(true);
  });

  test('a tool that draws nothing never adds an edge', () => {
    expect(drawingEdge('select', placed(['a', [0, 0]], ['b', [1, 0]]))).toBeNull();
    expect(drawingComplete('select', placed(['a', [0, 0]]))).toBe(false);
  });
});
