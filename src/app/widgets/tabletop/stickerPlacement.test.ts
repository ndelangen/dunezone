import { expect, test } from 'vite-plus/test';

import { placeStickers } from './stickerPlacement';

const square = [
  [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
    [0, 0],
  ],
] as const;
const band = [
  [
    [0, 0],
    [12, 0],
    [12, 2],
    [0, 2],
    [0, 0],
  ],
] as const;

test('one sticker sits in the roomiest middle of a territory, as large as allowed', () => {
  const { at, size } = placeStickers(square, 1, 1);
  expect(at).toHaveLength(1);
  expect(at[0][0]).toBeCloseTo(2, 0);
  expect(at[0][1]).toBeCloseTo(2, 0);
  expect(size).toBe(1);
});

test('stickers on a long band line up along its length, apart from each other', () => {
  const { at, size } = placeStickers(band, 2, 10);
  expect(at.map(([, y]) => Math.round(y))).toEqual([1, 1]);
  expect(Math.abs(at[0][0] - at[1][0])).toBeGreaterThan(2);
  expect(size).toBeGreaterThan(1.4);
  expect(size).toBeLessThan(1.8);
});
