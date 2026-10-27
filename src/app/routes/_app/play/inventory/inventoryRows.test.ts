import type { TablePiece } from '@shared/play/model';
import { expect, test } from 'vite-plus/test';

import { inventoryRows } from './inventoryRows';

const piece = (id: string, kind: TablePiece['kind'], type: string, count = 1, backName?: string): TablePiece => ({
  id,
  label: id,
  owner: 'shared',
  inventory: 'shared',
  color: '#000000',
  accent: '#000000',
  items: Array.from({ length: count }, (_, index) => ({
    id: `${id}-${index}`,
    faceUp: kind !== 'card',
    artwork: { back: 'https://dune.zone/back.jpg', backName, type },
  })),
  stackKey: `token:${id}`,
  position: [-25, 0, -25],
  orientation: 0,
  zoneId: null,
  locked: false,
  kind,
});

const shelves = (pieces: TablePiece[]) =>
  inventoryRows(pieces).map((row) => [row.label, row.pieces.map((entry) => entry.id), row.count, row.spawnType]);

test('keeps the Bundles shelf for adding only, since a bundle unpacks onto the shelves of its tokens', () => {
  const rows = inventoryRows([]);
  expect(rows.filter((row) => !row.holdsPieces).map((row) => row.label)).toEqual(['Bundles']);
});

test('keeps a shelf for every type the catalogue can add, in its order, even when empty', () => {
  expect(shelves([])).toEqual([
    ['Decks', [], 0, 'deck'],
    ['Bundles', [], 0, 'bundle'],
    ['Disc tokens', [], 0, 'token-disc'],
    ['Leader tokens', [], 0, 'token-leader'],
    ['Tech tokens', [], 0, 'token-tech'],
    ['Plate tokens', [], 0, 'token-plate'],
    ['Pointer tokens', [], 0, 'token-pointer'],
    ['Enhance tokens', [], 0, 'token-enhance'],
  ]);
});

test('puts every card on the Decks shelf and every token on its own type, other pieces last', () => {
  const rows = shelves([
    piece('customs', 'force', 'token-tech'),
    piece('recovery', 'force', 'token-disc', 3),
    piece('treachery', 'card', 'card-treachery', 5, 'Treachery'),
    piece('heighliners', 'force', 'token-tech'),
    piece('mystery', 'force', 'unknown'),
  ]);
  expect(rows.filter(([, ids]) => (ids as string[]).length)).toEqual([
    ['Decks', ['treachery'], 5, 'deck'],
    ['Disc tokens', ['recovery'], 3, 'token-disc'],
    ['Tech tokens', ['customs', 'heighliners'], 2, 'token-tech'],
    ['Other pieces', ['mystery'], 1, null],
  ]);
});
