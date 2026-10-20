/* @vitest-environment jsdom */
import { afterEach, expect, test } from 'vite-plus/test';

import { settleStoryViewport } from './storyViewport';

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  window.dispatchEvent(new Event('resize'));
});

test.each(['innerWidth', 'innerHeight'] as const)('a changed %s waits for its resize event', async (dimension) => {
  Object.defineProperty(window, dimension, { configurable: true, value: window[dimension] + 1 });
  let settled = false;
  const ready = settleStoryViewport().then(() => {
    settled = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(settled).toBe(false);
  window.dispatchEvent(new Event('resize'));
  await ready;
  expect(settled).toBe(true);
});

test('an unchanged viewport needs no resize event or animation frame', async () => {
  await expect(settleStoryViewport()).resolves.toBeUndefined();
});
