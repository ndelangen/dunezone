import { CENTER, RADIUS, retainedArrakisBoard } from '@shared/boards/geometry';
import { territoryId } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { describe, expect, it } from 'vitest';

import { territoryTintPresets } from '../../routes/_app/play/multiplayer/territoryTintPresets';
import { offRim, offsetPath, outerSegments, outlinePaths } from './tintOutline';

type Point = readonly [number, number];

function distance([px, py]: Point, [[ax, ay], [bx, by]]: readonly [Point, Point]) {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

describe('outerSegments', () => {
  it('drops the border two squares share', () => {
    const left = [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ] as const;
    const right = [
      [
        [1, 0],
        [2, 0],
        [2, 1],
        [1, 1],
        [1, 0],
      ],
    ] as const;
    expect(outerSegments([left, right])).toHaveLength(6);
  });

  it('leaves no border between the Fremen deployment territories', () => {
    const board = retainedArrakisBoard();
    const fremen = territoryTintPresets(board)[0].territories;
    const territories = boardTerritories(board)
      .filter((face) => fremen.includes(territoryId(board.properties[face.key].name)))
      .map((face) => face.rings);
    const edges = territories.map((rings) =>
      rings.flatMap((ring) => ring.slice(1).map((b, i) => [ring[i], b] as const))
    );
    const outer = outerSegments(territories);
    expect(outer.length).toBeGreaterThan(0);
    for (const [a, b] of outer) {
      const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(edges.filter((own) => own.some((edge) => distance(middle, edge) < 1e-3))).toHaveLength(1);
    }
  });
});

describe('outlinePaths', () => {
  it('joins the outer edges of two squares into one closed line', () => {
    const square = (x: number) =>
      [
        [
          [x, 0],
          [x + 1, 0],
          [x + 1, 1],
          [x, 1],
          [x, 0],
        ],
      ] as const;
    const paths = outlinePaths(outerSegments([square(0), square(1)]));
    expect(paths).toHaveLength(1);
    expect(paths[0].closed).toBe(true);
    expect(paths[0].points).toHaveLength(6);
  });

  it('covers every outer edge of the Fremen deployment exactly once', () => {
    const board = retainedArrakisBoard();
    const fremen = territoryTintPresets(board)[0].territories;
    const outer = outerSegments(
      boardTerritories(board)
        .filter((face) => fremen.includes(territoryId(board.properties[face.key].name)))
        .map((face) => face.rings)
    );
    const paths = outlinePaths(outer);
    const edges = paths.reduce((sum, { points, closed }) => sum + points.length - (closed ? 0 : 1), 0);
    expect(edges).toBe(outer.length);
  });
});

describe('offsetPath', () => {
  it('mitres the corners of a square so its moved sides meet', () => {
    const square: Point[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const moved = offsetPath({ points: square, closed: true }, 0.1);
    expect(moved.map(([x, y]) => [+x.toFixed(6), +y.toFixed(6)])).toEqual([
      [0.1, 0.1],
      [0.9, 0.1],
      [0.9, 0.9],
      [0.1, 0.9],
    ]);
  });
});

describe('offRim', () => {
  it('keeps the inland edges of a territory on the rim and drops the ones along it', () => {
    const board = retainedArrakisBoard();
    const segments = boardTerritories(board).flatMap((face) =>
      face.rings.flatMap((ring) => ring.slice(1).map((b, i) => [ring[i], b] as const))
    );
    const inland = offRim(segments, CENTER, RADIUS);
    expect(inland.length).toBeLessThan(segments.length);
    for (const [a, b] of inland) {
      const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      expect(Math.hypot(middle[0] - CENTER[0], middle[1] - CENTER[1])).toBeLessThan(RADIUS * 0.995);
    }
  });

  it('keeps a straight border cut across the board from rim to rim', () => {
    const diameter = [
      [CENTER[0] - RADIUS, CENTER[1]],
      [CENTER[0] + RADIUS, CENTER[1]],
    ] as const;
    expect(offRim([diameter], CENTER, RADIUS)).toEqual([diameter]);
  });
});
