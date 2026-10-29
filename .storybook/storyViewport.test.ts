/* @vitest-environment jsdom */
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { settleStoryViewport } from './storyViewport';

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

afterEach(() => {
  vi.unstubAllGlobals();
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
  const frame = vi.fn();
  vi.stubGlobal('requestAnimationFrame', frame);
  await expect(settleStoryViewport()).resolves.toBeUndefined();
  expect(frame).not.toHaveBeenCalled();
});

test('a missing resize still fails after a frame and reports both observations', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queueMicrotask(() => callback(performance.now()));
    return 1;
  });
  const cancel = vi.fn();
  vi.stubGlobal('cancelAnimationFrame', cancel);
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
  expect(message).toMatch(/animation frame 1200x900 \d+ms ago/);
  expect(cancel).toHaveBeenCalledWith(1);
});
