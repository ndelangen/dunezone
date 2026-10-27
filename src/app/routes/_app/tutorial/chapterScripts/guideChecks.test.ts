import { expect, test } from 'vite-plus/test';

import { watchCarryGrowth } from './guideChecks';

/* Feeds the watch one carried count per frame and answers what it said on each. */
const run = (frames: number[]) => {
  let at = 0;
  const growth = watchCarryGrowth(() => frames[at]!);
  return frames.map((_, index) => {
    at = index;
    return growth.tick();
  });
};

test('a carry that grew while held counts in the frame it is let go', () => {
  expect(run([0, 1, 2, 3, 0])).toEqual([false, false, false, false, true]);
});

test('a stack picked up whole, or a carry let go before it grew, never counts', () => {
  expect(run([0, 3, 0])).toEqual([false, false, false]);
  expect(run([0, 1, 0, 3, 0])).toEqual([false, false, false, false, false]);
});
