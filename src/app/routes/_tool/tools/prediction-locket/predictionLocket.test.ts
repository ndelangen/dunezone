import { expect, test } from 'vite-plus/test';

import { lockedAgoText } from './usePredictionLocket';

const locked = Date.parse('2026-11-09T18:00:00.000Z');
const later = (minutes: number) => locked + minutes * 60_000;

test('says how long ago, never a clock time, so every time zone at the table reads the same', () => {
  expect(lockedAgoText(locked, later(0.5))).toBe('just now');
  expect(lockedAgoText(locked, later(5))).toBe('5m ago');
  expect(lockedAgoText(locked, later(134))).toBe('2h 14m ago');
  expect(lockedAgoText(locked, later(60 * 26))).toBe('1d 2h ago');
});

test('a server time before the lock reads as just now', () => {
  expect(lockedAgoText(locked, later(-3))).toBe('just now');
});
