import { appendFileSync } from 'node:fs';

type SnapshotRun = { event?: string; head_repository?: { full_name?: string } | null };

const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week holding `now`. */
export function snapshotWeekStart(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(midnight - ((now.getUTCDay() + 6) % 7) * DAY);
}

/**
 * A daily tick refreshes only until one run succeeds in the week, so a Monday run stopped by a failed release recovers the next day.
 * A run counts only when it finished every step, which includes the upload and the cloud dev refresh.
 */
export async function snapshotRefreshDue(
  repository: string,
  token: string,
  now: Date,
  request: typeof fetch = fetch
): Promise<boolean> {
  const since = snapshotWeekStart(now).toISOString();
  const response = await request(
    `https://api.github.com/repos/${repository}/actions/workflows/anonymised-snapshot.yml/runs?branch=main&status=success&per_page=100&created=${encodeURIComponent(`>=${since}`)}`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    }
  );
  if (!response.ok) {
    throw new Error('Cannot read the snapshot runs of this week; dev data was not touched');
  }
  const { workflow_runs: runs = [] } = (await response.json()) as { workflow_runs?: SnapshotRun[] };
  return !runs.some(
    (run) =>
      (run.event === 'schedule' || run.event === 'workflow_dispatch') && run.head_repository?.full_name === repository
  );
}

if (import.meta.main) {
  const { GITHUB_EVENT_NAME, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_OUTPUT, GITHUB_STEP_SUMMARY } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_TOKEN || !GITHUB_OUTPUT || !GITHUB_STEP_SUMMARY) {
    throw new Error('The snapshot schedule check requires a GitHub Actions environment');
  }
  /* A manual dispatch always refreshes. */
  const due =
    GITHUB_EVENT_NAME !== 'schedule' || (await snapshotRefreshDue(GITHUB_REPOSITORY, GITHUB_TOKEN, new Date()));
  appendFileSync(GITHUB_OUTPUT, `due=${due}\n`);
  appendFileSync(GITHUB_STEP_SUMMARY, due ? 'Snapshot refresh is due.\n' : 'This week already has a snapshot.\n');
}
