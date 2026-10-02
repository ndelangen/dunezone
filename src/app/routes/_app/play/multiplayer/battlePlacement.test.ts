import { expect, test } from 'vitest';

import { battleCapsuleY } from './battlePlacement';

const HEADER = 83;
const HALF_CALLOUT = 131;

test('a battle in the lower half keeps its callout clear of the seated header', () => {
  const centre = battleCapsuleY(420, 800, HEADER);
  expect(centre - HALF_CALLOUT).toBeGreaterThanOrEqual(HEADER);
  expect(centre).toBeLessThan(400);
});

test('without a header the callout still keeps its old placement', () => {
  expect(battleCapsuleY(420, 800, 0)).toBe(170);
  expect(battleCapsuleY(700, 800, 0)).toBe(399);
});

test('a battle in the upper half places its callout below the middle', () => {
  expect(battleCapsuleY(100, 800, HEADER)).toBe(401);
  expect(battleCapsuleY(300, 800, HEADER)).toBe(550);
});

test('on a canvas too short for both, the callout clears the header before staying above the middle', () => {
  const centre = battleCapsuleY(300, 400, 120);
  expect(centre - HALF_CALLOUT).toBeGreaterThanOrEqual(120);
});
