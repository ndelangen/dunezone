import { expect, test } from 'vite-plus/test';

import { cityOf, knownCities, lockTimeText } from './usePredictionLocket';

const locked = Date.parse('2026-11-09T18:14:00.000Z');

test('shows the lock time in the city the player named, whatever zone the phone is in', () => {
  expect(lockTimeText(locked, 'Europe/Amsterdam', 'en-GB')).toBe('Mon 9 Nov, 19:14');
  expect(lockTimeText(locked, 'America/New_York', 'en-GB')).toBe('Mon 9 Nov, 13:14');
});

test('names a time zone by its city', () => {
  expect(cityOf('America/New_York')).toEqual({ timeZone: 'America/New_York', name: 'New York', region: 'America' });
  expect(cityOf('America/Argentina/Buenos_Aires').region).toBe('America / Argentina');
});

test('offers every city the browser knows, by name', () => {
  const names = knownCities().map((city) => city.name);
  expect(names).toContain('Amsterdam');
  expect(names).toEqual(names.toSorted((a, b) => a.localeCompare(b)));
});
