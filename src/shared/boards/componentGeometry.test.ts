import { expect, test } from 'vite-plus/test';

import { componentGeometrySchema } from '../asset-publishing/componentGeometry';
import { RULEBOOK_BOARD_DEFINITIONS } from '../rulebooks/boardDefinitions';
import { boardComponentGeometry } from './componentGeometry';
import { arrakisBoard, CENTER } from './geometry';

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
  /* Each line starts at the polar sink's edge, as the maintained geometry draws it, not at the centre. */
  for (const { d } of sectors) {
    expect(d.startsWith(`M${CENTER[0]} ${CENTER[1]}L`)).toBe(false);
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
