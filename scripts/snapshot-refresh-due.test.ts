import { expect, test, vi } from 'vite-plus/test';

import { snapshotRefreshDue, snapshotWeekStart } from './snapshot-refresh-due';

const repository = 'owner/repo';
const thursday = new Date('2026-11-05T05:17:00Z');
const ownRun = (event: string) => ({ event, head_repository: { full_name: repository } });
const listing = (workflow_runs: unknown[]) => vi.fn<typeof fetch>().mockResolvedValue(Response.json({ workflow_runs }));

test.each([
  ['2026-11-02T00:00:00Z', '2026-11-02T00:00:00.000Z'],
  ['2026-11-05T05:17:00Z', '2026-11-02T00:00:00.000Z'],
  ['2026-11-08T23:59:59Z', '2026-11-02T00:00:00.000Z'],
])('a week starts on Monday at midnight UTC: %s', (now, start) => {
  expect(snapshotWeekStart(new Date(now)).toISOString()).toBe(start);
});

test('a week without a successful run is due, which recovers a failed Monday', async () => {
  const request = listing([]);
  await expect(snapshotRefreshDue(repository, 'test', thursday, request)).resolves.toBe(true);
  expect(decodeURIComponent(String(request.mock.calls[0]?.[0]))).toContain('created=>=2026-11-02T00:00:00.000Z');
});

test.each(['schedule', 'workflow_dispatch'])('a successful %s run settles the week', async (event) => {
  await expect(snapshotRefreshDue(repository, 'test', thursday, listing([ownRun(event)]))).resolves.toBe(false);
});

test('a run from a fork or another event does not settle the week', async () => {
  const runs = [ownRun('pull_request'), { event: 'schedule', head_repository: { full_name: 'fork/repo' } }];
  await expect(snapshotRefreshDue(repository, 'test', thursday, listing(runs))).resolves.toBe(true);
});

test('an unreadable run list stops before any export', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
  await expect(snapshotRefreshDue(repository, 'test', thursday, request)).rejects.toThrow(/dev data was not touched/);
});
