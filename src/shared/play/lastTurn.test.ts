import { expect, test } from 'vitest';

import { lastTurnOf, turnCaption } from './lastTurn';

test('a game without a last turn plays the standard ten', () => {
  expect(lastTurnOf({})).toBe(10);
  expect(lastTurnOf({ lastTurn: 6 })).toBe(6);
});

test('the caption counts up to the last turn and drops its "of" past it', () => {
  expect(turnCaption(1)).toBe('Turn 1 of 10');
  expect(turnCaption(6, 6)).toBe('Turn 6 of 6');
  expect(turnCaption(7, 6)).toBe('Turn 7');
});
