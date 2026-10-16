import { retainedArrakisBoard } from '@shared/boards/geometry';
import { territoryId } from '@shared/boards/schema';
import { boardTerritories } from '@shared/boards/territories';
import { describe, expect, it } from 'vitest';

import { territoryTintPresets } from '../../routes/_app/play/multiplayer/territoryTintPresets';
import { outerSegments } from './tintOutline';

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
