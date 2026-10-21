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

test('a missing resize reports the observed events and current viewport state', async () => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 414 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 896 });
  window.dispatchEvent(new Event('resize'));
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
  const error: unknown = await settleStoryViewport().catch((failure: unknown) => failure);
  expect(error).toBeInstanceOf(Error);
  const message = (error as Error).message;
  expect(message).toContain('1200x900, but its last resize event acknowledged 414x896');
  expect(message).toContain(`document is ${document.visibilityState}`);
  expect(message).toContain('layout viewport is');
  expect(message).toContain('visual viewport is');
  expect(message).toMatch(/window resize 414x896 \d+ms ago/);
});
