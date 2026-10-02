/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { LONG_PRESS_MS, watchLongPress } from './longPress';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function pointer(type: string, x: number, pointerId = 1) {
  return Object.assign(new MouseEvent(type, { clientX: x, clientY: 10 }), { pointerId });
}

function press() {
  const events = new EventTarget();
  const onHold = vi.fn();
  const stop = watchLongPress(events as Window, { pointerId: 1, clientX: 10, clientY: 10 }, onHold);
  return { events, onHold, stop };
}

test('a press that rests in place holds once', () => {
  const { events, onHold } = press();
  events.dispatchEvent(pointer('pointermove', 15));
  vi.advanceTimersByTime(LONG_PRESS_MS);
  expect(onHold).toHaveBeenCalledOnce();
  events.dispatchEvent(pointer('pointerup', 15));
  vi.advanceTimersByTime(LONG_PRESS_MS);
  expect(onHold).toHaveBeenCalledOnce();
});

test.each([
  ['lifts', pointer('pointerup', 10)],
  ['is cancelled', pointer('pointercancel', 10)],
  ['moves past the slop', pointer('pointermove', 19)],
])('a press that %s before the delay never holds', (_case, event) => {
  const { events, onHold } = press();
  vi.advanceTimersByTime(LONG_PRESS_MS - 1);
  events.dispatchEvent(event);
  vi.advanceTimersByTime(LONG_PRESS_MS);
  expect(onHold).not.toHaveBeenCalled();
});

test('another pointer leaves the press alone', () => {
  const { events, onHold } = press();
  events.dispatchEvent(pointer('pointerup', 10, 2));
  events.dispatchEvent(pointer('pointermove', 90, 2));
  vi.advanceTimersByTime(LONG_PRESS_MS);
  expect(onHold).toHaveBeenCalledOnce();
});

test('letting go stops the hold', () => {
  const { onHold, stop } = press();
  stop();
  vi.advanceTimersByTime(LONG_PRESS_MS);
  expect(onHold).not.toHaveBeenCalled();
});
