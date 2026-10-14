import { afterEach, expect, test, vi } from 'vitest';

import { observeAnimationFrameProgress } from './verify-hosted-animation-frames';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function browserFrames() {
  const callbacks = new Map<number, FrameRequestCallback>();
  let nextHandle = 42;
  const browser = {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      if (typeof callback !== 'function') {
        throw new TypeError('Callback must be a function.');
      }
      const handle = nextHandle++;
      callbacks.set(handle, callback);
      return handle;
    }),
    cancelAnimationFrame: vi.fn((handle: number) => callbacks.delete(handle)),
  };
  const cancel = browser.cancelAnimationFrame;
  vi.stubGlobal('window', browser);
  const now = vi.spyOn(performance, 'now').mockReturnValue(100);
  observeAnimationFrameProgress();
  return { cancel, callbacks, now };
}

test('an undelivered frame retains its native handle and reports its age without requesting more frames', () => {
  const { callbacks, now } = browserFrames();
  const callback = vi.fn();
  const handle = window.requestAnimationFrame(callback);
  expect(callbacks.has(handle)).toBe(true);
  now.mockReturnValue(30_100);
  expect(window.hostedPlayAnimationFrames?.()).toMatchObject({
    requested: 1,
    delivered: 0,
    pending: 1,
    oldestPendingMs: 30_000,
    lastDeliveredAgoMs: null,
  });
  expect(callbacks.size).toBe(1);
  expect(callback).not.toHaveBeenCalled();
});

test('delivery forwards the browser timestamp and callback receiver, while cancellation reaches the browser', () => {
  const { cancel, callbacks, now } = browserFrames();
  const callback = vi.fn(function (this: Window, _time: number) {
    expect(this).toBe(window);
  });
  const deliveredHandle = window.requestAnimationFrame(callback);
  const cancelledHandle = window.requestAnimationFrame(vi.fn());
  window.cancelAnimationFrame(cancelledHandle);
  expect(cancel).toHaveBeenCalledWith(cancelledHandle);
  expect(callbacks.has(cancelledHandle)).toBe(false);
  now.mockReturnValue(200);
  callbacks.get(deliveredHandle)?.(175);
  expect(callback).toHaveBeenCalledWith(175);
  now.mockReturnValue(250);
  expect(window.hostedPlayAnimationFrames?.()).toMatchObject({
    requested: 2,
    delivered: 1,
    cancelled: 1,
    pending: 0,
    oldestPendingMs: null,
    lastDeliveredAgoMs: 50,
  });
});

test('a throwing callback keeps its original error and records how long it blocked delivery', () => {
  const { callbacks, now } = browserFrames();
  const failure = new Error('Frame callback failed.');
  const handle = window.requestAnimationFrame(() => {
    now.mockReturnValue(31_000);
    throw failure;
  });
  expect(() => callbacks.get(handle)?.(100)).toThrow(failure);
  expect(window.hostedPlayAnimationFrames?.()).toMatchObject({
    delivered: 1,
    pending: 0,
    maxCallbackDurationMs: 30_900,
  });
});

test('native callback validation rejects invalid input before a frame is queued', () => {
  const { callbacks } = browserFrames();
  expect(() => window.requestAnimationFrame(null as unknown as FrameRequestCallback)).toThrow(TypeError);
  expect(callbacks.size).toBe(0);
  expect(window.hostedPlayAnimationFrames?.()).toMatchObject({ requested: 0, pending: 0 });
});
