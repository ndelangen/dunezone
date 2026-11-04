import { expect, test } from 'vite-plus/test';

import { componentGeometrySchema } from '../asset-publishing/componentGeometry';
import { RULEBOOK_BOARD_DEFINITIONS } from '../rulebooks/boardDefinitions';
import { boardComponentGeometry } from './componentGeometry';
import { arrakisBoard, CENTER, derive, RADIUS } from './geometry';
import type { Point } from './geometry';

/** How far a point lies from the nearest edge of `rings`. */
function distanceToRings(point: Point, rings: readonly (readonly Point[])[]) {
  let nearest = Infinity;
  for (const ring of rings) {
    for (let index = 0; index < ring.length; index++) {
      const [a, b] = [ring[index]!, ring[(index + 1) % ring.length]!];
      const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
      const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      nearest = Math.min(nearest, Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy)));
    }
  }
  return nearest;
}

test('a saved Arrakis board gives a Rulebook every territory, group and sectors key the maintained Arrakis geometry highlights', () => {
  const geometry = componentGeometrySchema.parse(boardComponentGeometry(arrakisBoard(), 1948, 1948));
  const keys = new Set(geometry.parts.map((part) => part.key));
  const maintained = RULEBOOK_BOARD_DEFINITIONS[0]!.geometry.parts
    .filter((part) => part.highlight)
    .map((part) => part.key);
  expect(maintained.filter((key) => !keys.has(key))).toEqual([]);
  expect(geometry.parts.find((part) => part.key === 'strongholds')?.highlight?.paths).toHaveLength(5);
  const sectors = geometry.parts.find((part) => part.key === 'sectors')?.highlight?.paths ?? [];
  expect(sectors).toHaveLength(18);
  /* Each line starts on the polar sink's edge, as the maintained geometry draws it, and ends on the rim. */
  const board = arrakisBoard();
  const polar = derive(board)
    .faces.filter((face) => board.properties[face.key]!.type === 'polar')
    .flatMap((face) => face.rings);
  for (const { d } of sectors) {
    const [sx, sy, ex, ey] = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number) as [number, number, number, number];
    expect(distanceToRings([sx, sy], polar)).toBeLessThan(0.05);
    expect(Math.hypot(ex - CENTER[0], ey - CENTER[1])).toBeCloseTo(RADIUS, 1);
  }
  for (const part of geometry.parts) {
    expect(part.x + part.width).toBeLessThanOrEqual(1.000001);
    expect(part.y + part.height).toBeLessThanOrEqual(1.000001);
  }
});

test('a territory name longer than a geometry label still gives a valid geometry', () => {
  const board = arrakisBoard();
  const [key, property] = Object.entries(board.properties)[0]!;
  const long = { ...board, properties: { ...board.properties, [key]: { ...property, name: `A${'!'.repeat(120)}` } } };
  expect(componentGeometrySchema.safeParse(boardComponentGeometry(long, 1948, 1948)).success).toBe(true);
});

test('a territory the board names Sectors keeps its own highlight', () => {
  const board = arrakisBoard();
  const [key, property] = Object.entries(board.properties).find(([, each]) => each.type === 'sand')!;
  const named = {
    ...board,
    properties: { ...board.properties, [key]: { ...property, id: 'sectors', name: 'Sectors' } },
  };
  const sectors = boardComponentGeometry(named, 1948, 1948).parts.filter((part) => part.key === 'sectors');
  expect(sectors).toHaveLength(1);
  expect(sectors[0]!.label).toBe('Sectors');
  expect(sectors[0]!.highlight?.paths).toHaveLength(1);
});
