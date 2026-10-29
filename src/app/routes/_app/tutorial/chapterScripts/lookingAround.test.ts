import { afterEach, expect, test, vi } from 'vite-plus/test';

import { pingedTwice } from './lookingAround';

afterEach(() => vi.useRealTimers());

test('requires two new pings and one second after the second, without timers left behind', () => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  const pings = [5000];
  const check = pingedTwice(() => pings);
  const start = check.begin();
  expect(check.done(start)).toBe(false);
  pings.push(Date.now());
  vi.advanceTimersByTime(2000);
  expect(check.done(start)).toBe(false);
  pings.push(Date.now());
  vi.advanceTimersByTime(999);
  expect(check.done(start)).toBe(false);
  vi.advanceTimersByTime(1);
  expect(check.done(start)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
