import { expect, test } from 'vite-plus/test';

import { catalogueEntries } from './mediaCatalogue';
import { holdsArtwork, mediaTiles } from './mediaTiles';

test('paired decal tiles retain every file and keep independent designs separate', () => {
  const decals = catalogueEntries.filter((entry) => entry.kind === 'decal');
  const tiles = mediaTiles(decals);
  expect(tiles).toHaveLength(345);
  expect(tiles.filter((tile) => tile.variants.length === 2)).toHaveLength(157);
  expect(tiles.flatMap((tile) => tile.variants.map((entry) => entry.value)).sort()).toEqual(
    decals.map((entry) => entry.value).sort()
  );
});

test('a match in the color version keeps its mono counterpart available', () => {
  const color = catalogueEntries.find((entry) => entry.value === '/vector/decal/atomics-multicolor.svg')!;
  const [tile] = mediaTiles([color]);
  expect(tile?.entry).toBe(color);
  expect(tile?.label).toBe('Atomics');
  expect(tile?.variants.map((entry) => entry.value)).toEqual([
    '/vector/decal/atomics.svg',
    '/vector/decal/atomics-multicolor.svg',
  ]);
});

test('a tile holds both versions of its artwork and nothing else', () => {
  const mono = catalogueEntries.find((entry) => entry.value === '/vector/decal/atomics.svg')!;
  const [tile] = mediaTiles([mono]);
  expect(holdsArtwork(tile!, '/vector/decal/atomics.svg')).toBe(true);
  expect(holdsArtwork(tile!, '/vector/decal/atomics-multicolor.svg')).toBe(true);
  expect(holdsArtwork(tile!, '/vector/decal/crossed-knives.svg')).toBe(false);
});
