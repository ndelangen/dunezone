import { expect, test, vi } from 'vite-plus/test';

import { DEV_REFRESH_AFTER_DAYS, devRefreshDue, snapshotRefreshDue, snapshotWeekStart } from './snapshot-refresh-due';

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
  expect(decodeURIComponent(request.mock.calls[0]?.[0] as string)).toContain('created=>=2026-11-02T00:00:00.000Z');
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

/** Answers the run listing and each run's jobs, as the GitHub API would. */
function runsWithReloads(runs: { id: number; reload?: string | null; stepName?: string; fork?: boolean }[]) {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    const jobs = url.match(/\/runs\/(\d+)\/jobs/);
    if (!jobs) {
      return Response.json({
        workflow_runs: runs.map((run) => ({
          id: run.id,
          event: 'schedule',
          head_repository: { full_name: run.fork ? 'fork/repo' : repository },
        })),
      });
    }
    const run = runs.find((candidate) => candidate.id === Number(jobs[1]));
    const steps = [{ name: 'Upload the anonymised snapshot', conclusion: 'success' }];
    if (run?.reload !== undefined) {
      steps.push({
        name: run.stepName ?? 'Refresh cloud dev from the anonymised snapshot every fourth week',
        conclusion: run.reload!,
      });
    }
    return Response.json({ jobs: [{ steps }] });
  });
}

test('cloud dev is not reloaded again while a successful reload is recent', async () => {
  const request = runsWithReloads([
    { id: 1, reload: 'skipped' },
    { id: 2, reload: 'success' },
  ]);
  await expect(devRefreshDue(repository, 'test', thursday, request)).resolves.toBe(false);
  const listing = decodeURIComponent(request.mock.calls[0]?.[0] as string);
  expect(listing).toContain(
    `created=>=${new Date(thursday.getTime() - DEV_REFRESH_AFTER_DAYS * 86_400_000).toISOString()}`
  );
});

test('the reload step under its earlier weekly name counts too', async () => {
  const request = runsWithReloads([
    { id: 1, reload: 'success', stepName: 'Refresh cloud dev from the weekly anonymised snapshot' },
  ]);
  await expect(devRefreshDue(repository, 'test', thursday, request)).resolves.toBe(false);
});

test('exports that skipped the reload leave it due, so a failed reload is retried until one succeeds', async () => {
  await expect(devRefreshDue(repository, 'test', thursday, runsWithReloads([]))).resolves.toBe(true);
  const skipped = runsWithReloads([{ id: 1, reload: 'skipped' }, { id: 2, reload: 'skipped' }, { id: 3 }]);
  await expect(devRefreshDue(repository, 'test', thursday, skipped)).resolves.toBe(true);
});

test('a reload from a fork does not count', async () => {
  const request = runsWithReloads([{ id: 1, reload: 'success', fork: true }]);
  await expect(devRefreshDue(repository, 'test', thursday, request)).resolves.toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});

test('unreadable reload history stops before touching dev', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 }));
  await expect(devRefreshDue(repository, 'test', thursday, request)).rejects.toThrow(/dev data was not touched/);
});
