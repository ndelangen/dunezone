/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { LONG_PRESS_MS, swallowLift, watchLongPress } from './longPress';

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

function touch(type: string, x: number) {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, 'changedTouches', { value: [{ clientX: x, clientY: 10 }] });
  return event;
}

test('the lift of the held finger is swallowed once, and another finger lifting is not', () => {
  const events = new EventTarget();
  swallowLift(events as Window, { clientX: 10, clientY: 10 });
  const other = touch('touchend', 200);
  events.dispatchEvent(other);
  expect(other.defaultPrevented).toBe(false);
  const lift = touch('touchend', 14);
  events.dispatchEvent(lift);
  expect(lift.defaultPrevented).toBe(true);
  const later = touch('touchend', 10);
  events.dispatchEvent(later);
  expect(later.defaultPrevented).toBe(false);
});

test.each([
  ['a cancelled touch', (events: EventTarget) => events.dispatchEvent(new Event('touchcancel'))],
  ['letting go', (_events: EventTarget, stop: () => void) => stop()],
])('after %s no later lift is swallowed', (_case, end) => {
  const events = new EventTarget();
  const stop = swallowLift(events as Window, { clientX: 10, clientY: 10 });
  end(events, stop);
  const lift = touch('touchend', 10);
  events.dispatchEvent(lift);
  expect(lift.defaultPrevented).toBe(false);
});
