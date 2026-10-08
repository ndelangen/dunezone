import { DOMParser } from 'linkedom';
import svgpath from 'svgpath';
import { describe, expect, it } from 'vitest';

import { blankBoard, CENTER, RADIUS, referenceSectors, snapPoint } from './geometry';
import type { Board, Point } from './geometry';

const guide = new DOMParser().parseFromString(`<svg>${referenceSectors}</svg>`, 'image/svg+xml');
const visibleLines = [...guide.querySelectorAll('path')].map((element) => {
  const points: Point[] = [];
  svgpath(element.getAttribute('d')!)
    .transform(element.parentElement!.getAttribute('transform') || '')
    .abs()
    .iterate(([kind, ...values]) => {
      const previous = points.at(-1);
      points.push(
        kind === 'H' ? [values[0]!, previous![1]] : kind === 'V' ? [previous![0], values[0]!] : [values[0]!, values[1]!]
      );
    });
  return points;
});
const board: Board = { nodes: {}, edges: [], properties: {} };

describe('Sector guide snapping', () => {
  it('keeps points on each visible sector line in place', () => {
    expect(visibleLines).toHaveLength(18);
    for (const [a, b] of visibleLines) {
      expect(a).toEqual(CENTER);
      expect(Math.hypot(b[0] - CENTER[0], b[1] - CENTER[1])).toBeCloseTo(RADIUS, 8);
      const point: Point = [a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55];
      const snapped = snapPoint(board, point, true, 30);
      expect(snapped.feedback).toBe('Snapped to sector guide');
      expect(Math.hypot(snapped.point[0] - point[0], snapped.point[1] - point[1])).toBeLessThan(1e-7);
    }
  });

  it('attracts an offset point to the visible line and leaves it free with snapping off', () => {
    const [a, b] = visibleLines[0];
    const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const offset: Point = [mid[0] + (6 * (b[1] - a[1])) / length, mid[1] - (6 * (b[0] - a[0])) / length];
    const snapped = snapPoint(board, offset, true, 12);
    expect(Math.hypot(snapped.point[0] - mid[0], snapped.point[1] - mid[1])).toBeLessThan(1e-7);
    expect(snapPoint(board, offset, false).point).toEqual(offset);
  });

  it('snaps to the visible sector and rim intersection when both attract the point', () => {
    const [a, b] = visibleLines[0];
    const input: Point = [a[0] + (b[0] - a[0]) * 0.88, a[1] + (b[1] - a[1]) * 0.88];
    const snapped = snapPoint(blankBoard(), input, true, 35);
    const cross = (snapped.point[0] - a[0]) * (b[1] - a[1]) - (snapped.point[1] - a[1]) * (b[0] - a[0]);
    expect(Math.abs(cross) / Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(1e-7);
    expect(Math.abs(Math.hypot(snapped.point[0] - CENTER[0], snapped.point[1] - CENTER[1]) - RADIUS)).toBeLessThan(
      1e-7
    );
    expect(snapped.feedback).toBe('Snapped to sector guide · Circle boundary');
  });
});
