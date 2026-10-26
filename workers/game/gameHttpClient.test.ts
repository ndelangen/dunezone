import { afterEach, expect, test, vi } from 'vite-plus/test';

import { gameHttpClient } from './gameHttpClient';
import type { ConvexCall } from './roomSummary';

afterEach(() => {
  vi.unstubAllGlobals();
});

const answer = (status: number, body: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }))
  );

test('a function failure is observed as a failed call, and a success as a successful one', async () => {
  const calls: ConvexCall[] = [];
  const client = gameHttpClient('https://example.convex.cloud', (call) => calls.push(call));

  answer(560, { status: 'error', errorMessage: 'boom' });
  await expect(client.query('playAdmission:seatLimitReached' as never, {} as never)).rejects.toThrow();
  answer(200, { status: 'success', value: null, logLines: [] });
  await client.query('playAdmission:seatLimitReached' as never, {} as never);

  expect(calls.map(({ path, ok }) => ({ path, ok }))).toEqual([
    { path: 'playAdmission:seatLimitReached', ok: false },
    { path: 'playAdmission:seatLimitReached', ok: true },
  ]);
});
