/* @vitest-environment jsdom */

import { autoUpdate } from '@floating-ui/dom';
import { afterEach, expect, test, vi } from 'vite-plus/test';

afterEach(() => vi.unstubAllGlobals());

test('floating positions update after resize delivery, coalesce, and stop when disposed', () => {
  const observers: { notify: ResizeObserverCallback; observer: ResizeObserver }[] = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(notify: ResizeObserverCallback) {
        observers.push({ notify, observer: this as unknown as ResizeObserver });
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const reference = document.createElement('button');
  const floating = document.createElement('div');
  document.body.append(reference, floating);
  const update = vi.fn();
  const dispose = autoUpdate(reference, floating, update, { ancestorResize: false, layoutShift: false });
  try {
    expect(update).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('scroll'));
    expect(update).toHaveBeenCalledTimes(2);
    const observed = observers[0];
    if (!observed) {
      throw new Error('Floating UI did not observe its elements');
    }
    const notify = (target: Element) => observed.notify([{ target } as ResizeObserverEntry], observed.observer);
    notify(floating);
    notify(floating);
    expect(update).toHaveBeenCalledTimes(2);
    expect(frames.size).toBe(1);
    for (const [id, callback] of frames) {
      frames.delete(id);
      callback(0);
    }
    expect(update).toHaveBeenCalledTimes(3);
    notify(reference);
    expect(frames.size).toBe(2);
    dispose();
    expect(frames.size).toBe(0);
    window.dispatchEvent(new Event('scroll'));
    expect(update).toHaveBeenCalledTimes(3);
  } finally {
    dispose();
    reference.remove();
    floating.remove();
  }
});
