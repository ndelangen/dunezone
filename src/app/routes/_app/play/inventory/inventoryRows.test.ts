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

test('keeps every piece of one type on one row: cards by their back, then tokens by their type', () => {
  const rows = inventoryRows([
    piece('customs', 'force', 'token-tech'),
    piece('recovery', 'force', 'token-disc', 3),
    piece('treachery', 'card', 'card-treachery', 5, 'Treachery'),
    piece('heighliners', 'force', 'token-tech'),
    piece('mystery', 'force', 'unknown'),
  ]);
  expect(rows.map((row) => [row.label, row.pieces.map((entry) => entry.id), row.count, row.techTokens])).toEqual([
    ['Treachery', ['treachery'], 5, false],
    ['Disc tokens', ['recovery'], 3, false],
    ['Tech tokens', ['customs', 'heighliners'], 2, true],
    ['Other pieces', ['mystery'], 1, false],
  ]);
});

test('an empty inventory has no rows', () => {
  expect(inventoryRows([])).toEqual([]);
});

test('keeps the tech token row, empty, once every tech token in the game is drawn', () => {
  expect(inventoryRows([piece('recovery', 'force', 'token-disc')], true)).toEqual([
    expect.objectContaining({ label: 'Disc tokens', count: 1, techTokens: false }),
    { key: 'type:token-tech', label: 'Tech tokens', pieces: [], count: 0, techTokens: true },
  ]);
});
