/* @vitest-environment jsdom */
import { Scheduler } from '@react-three/fiber/webgpu';
import { afterEach, expect, test, vi } from 'vitest';

import { resetFrameLag, waitForFrame } from './storyWaits';

/* Native delivery stays stopped; only the story wait can advance the renderer. */
vi.hoisted(() => {
  let frameId = 0;
  window.requestAnimationFrame = () => ++frameId;
  window.cancelAnimationFrame = () => {};
});

const scheduler = new Scheduler();
afterEach(() => scheduler.stop());

test('a pending renderer frame serves the next root after the story diagnostics reset', async () => {
  scheduler.registerRoot('previous-story');
  /* The browser sessions keep one scheduler while asynchronous canvas teardown overlaps the next mount. */
  await new Promise((resolve) => setTimeout(resolve, 1));
  resetFrameLag();
  scheduler.registerRoot('current-story');
  let frames = 0;
  scheduler.register(
    () => {
      frames += 1;
    },
    { rootId: 'current-story' }
  );
  scheduler.unregisterRoot('previous-story');
  try {
    await waitForFrame(() => expect(frames).toBeGreaterThan(0), { timeout: 200 });
  } finally {
    scheduler.unregisterRoot('current-story');
  }
});

test('an asynchronous check can await another frame without stopping frame delivery', async () => {
  await waitForFrame(
    async () => {
      const frame = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
      expect(frame).toBeGreaterThan(0);
    },
    { timeout: 200, interval: 10 }
  );
});

test.each(['resolved', 'rejected'] as const)('frame delivery ends after a %s wait', async (outcome) => {
  const wait = waitForFrame(
    () => {
      if (outcome === 'rejected') {
        throw new Error('The expected state is still absent');
      }
      return true;
    },
    { timeout: 20, interval: 5 }
  );
  if (outcome === 'rejected') {
    await expect(wait).rejects.toThrow('The expected state is still absent');
  } else {
    await expect(wait).resolves.toBe(true);
  }
  const later = vi.fn();
  const id = requestAnimationFrame(later);
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(later).not.toHaveBeenCalled();
  } finally {
    cancelAnimationFrame(id);
  }
});

test('a callback cancelled by an earlier callback does not run', async () => {
  const cancelled = vi.fn();
  let id = 0;
  requestAnimationFrame(() => cancelAnimationFrame(id));
  id = requestAnimationFrame(cancelled);
  await waitForFrame(() => expect(cancelled).not.toHaveBeenCalled(), { timeout: 200 });
});

test('DOM changes do not recursively drive renderer frames between timer ticks', async () => {
  const label = document.createElement('div');
  document.body.append(label);
  const times: number[] = [];
  const frame = (time: number) => {
    times.push(time);
    label.textContent = String(times.length);
    if (times.length < 6) {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
  try {
    await waitForFrame(() => expect(label.textContent).toBe('6'), { timeout: 300, interval: 10 });
    /* Five later frames need timer ticks, even though each label mutation wakes the assertion. */
    expect(times.at(-1)! - times[0]).toBeGreaterThanOrEqual(30);
  } finally {
    label.remove();
  }
});
