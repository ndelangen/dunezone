import { BOARD_RIM_SURFACE_Y, TABLE_SURFACE_Y } from '@shared/play/tableGeometry';
import { describe, expect, test } from 'vite-plus/test';

import { ALLIANCE_TOKEN_RADIUS, COIN_BAND, coinRadius, coinTop } from './allianceCoinGeometry';

/* A faction token's published face sits about this far above its base. */
const TOKEN_FACE_HEIGHT = 0.047;
const COUNTS = Array.from({ length: 17 }, (_, index) => index + 1);

describe('alliance coins', () => {
  test('one or two coins keep their full bands, and more share the width of two', () => {
    expect(coinRadius(0, 1)).toBeCloseTo(ALLIANCE_TOKEN_RADIUS + COIN_BAND);
    expect(coinRadius(1, 2)).toBeCloseTo(ALLIANCE_TOKEN_RADIUS + 2 * COIN_BAND);
    for (const count of COUNTS) {
      expect(coinRadius(count - 1, count)).toBeLessThanOrEqual(ALLIANCE_TOKEN_RADIUS + 2 * COIN_BAND + 1e-9);
    }
  });

  for (const [where, base] of [
    ['on the rim', BOARD_RIM_SURFACE_Y],
    ['on the bare table', TABLE_SURFACE_Y],
  ] as const) {
    test(`coins under a token ${where} stay below its face and step down outwards`, () => {
      for (const count of COUNTS) {
        const tops = Array.from({ length: count }, (_, index) => coinTop(index, count, base));
        expect(tops[0]!).toBeLessThan(base + TOKEN_FACE_HEIGHT);
        for (let index = 1; index < count; index += 1) {
          expect(tops[index]!).toBeLessThan(tops[index - 1]!);
        }
      }
    });
  }
});
