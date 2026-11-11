import { expect, test } from 'vitest';

import { timeFromResponse } from './serverTime';

const response = (date: string | null, ok = true) => ({
  ok,
  headers: new Headers(date ? { date } : {}),
});

test('reads the lock time from the server’s Date header', () => {
  expect(timeFromResponse(response('Mon, 09 Nov 2026 18:14:00 GMT'))).toBe(Date.UTC(2026, 10, 9, 18, 14));
});

test('refuses to lock without a time from the server', () => {
  expect(() => timeFromResponse(response(null))).toThrow();
  expect(() => timeFromResponse(response('not a date'))).toThrow();
  expect(() => timeFromResponse(response('Mon, 09 Nov 2026 18:14:00 GMT', false))).toThrow();
});
