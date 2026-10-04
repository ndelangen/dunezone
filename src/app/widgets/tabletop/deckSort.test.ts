import { expect, test } from 'vitest';

import { sortShift, sortTarget } from './deckSort';

const centers = [50, 150, 250, 350];

test('a held card lands in the slot nearest where it is carried', () => {
  expect(sortTarget(centers, 0, 0)).toBe(0);
  expect(sortTarget(centers, 0, 40)).toBe(0);
  expect(sortTarget(centers, 0, 60)).toBe(1);
  expect(sortTarget(centers, 0, 900)).toBe(3);
  expect(sortTarget(centers, 3, -260)).toBe(0);
});

test('the cards a held card passes slide one place toward the gap it left', () => {
  expect([0, 1, 2, 3].map((index) => sortShift(index, 0, 2, 100))).toEqual([0, -100, -100, 0]);
  expect([0, 1, 2, 3].map((index) => sortShift(index, 3, 1, 100))).toEqual([0, 100, 100, 0]);
  expect([0, 1, 2, 3].map((index) => sortShift(index, 1, 1, 100))).toEqual([0, 0, 0, 0]);
});
