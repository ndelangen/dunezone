import { appendFileSync } from 'node:fs';

type SnapshotRun = { event?: string; head_repository?: { full_name?: string } | null };

const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week holding `now`. */
export function snapshotWeekStart(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(midnight - ((now.getUTCDay() + 6) % 7) * DAY);
}

/**
 * A snapshot reloads cloud dev only when no successful run reloaded it within this many days, so with weekly exports dev reloads every fourth week.
 * A reload replays every required migration over the whole snapshot, which read 160 to 190 MB of dev database I/O each week in November 2026, about a third of the month's usage (Norbert, 22 November 2026: cloud dev data can be up to four weeks old).
 * Twenty-five days leaves room for a weekly run that slips a day or two.
 */
export const DEV_REFRESH_AFTER_DAYS = 25;

/* Matches the step's current name and the weekly name it had before. */
export const DEV_REFRESH_STEP = /^Refresh cloud dev /;

type RunJobs = { jobs?: { steps?: { name?: string; conclusion?: string | null }[] }[] };

async function readGitHub<T>(url: string, token: string, request: typeof fetch, failure: string): Promise<T> {
  const response = await request(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(failure);
  }
  return (await response.json()) as T;
}

/**
 * Whether this snapshot should also reload cloud dev: no successful run reloaded it within `DEV_REFRESH_AFTER_DAYS`.
 * It reads the reload step of each successful run, not a calendar, so a reload that failed stays due until one succeeds.
 */
export async function devRefreshDue(
  repository: string,
  token: string,
  now: Date,
  request: typeof fetch = fetch
): Promise<boolean> {
  const failure = 'Cannot read the recent cloud dev reloads; dev data was not touched';
  const created = encodeURIComponent('>=' + new Date(now.getTime() - DEV_REFRESH_AFTER_DAYS * DAY).toISOString());
  const { workflow_runs: runs = [] } = await readGitHub<{ workflow_runs?: (SnapshotRun & { id?: number })[] }>(
    `https://api.github.com/repos/${repository}/actions/workflows/anonymised-snapshot.yml/runs?branch=main&status=success&per_page=100&created=${created}`,
    token,
    request,
    failure
  );
  for (const run of runs) {
    if (run.head_repository?.full_name !== repository || run.id === undefined) {
      continue;
    }
    const { jobs = [] } = await readGitHub<RunJobs>(
      `https://api.github.com/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`,
      token,
      request,
      failure
    );
    const reloaded = jobs.some((job) =>
      (job.steps ?? []).some((step) => DEV_REFRESH_STEP.test(step.name ?? '') && step.conclusion === 'success')
    );
    if (reloaded) {
      return false;
    }
  }
  return true;
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
  const created = encodeURIComponent('>=' + snapshotWeekStart(now).toISOString());
  const response = await request(
    `https://api.github.com/repos/${repository}/actions/workflows/anonymised-snapshot.yml/runs?branch=main&status=success&per_page=100&created=${created}`,
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
  /* A manual dispatch always refreshes, cloud dev included. */
  const manual = GITHUB_EVENT_NAME !== 'schedule';
  const now = new Date();
  const due = manual || (await snapshotRefreshDue(GITHUB_REPOSITORY, GITHUB_TOKEN, now));
  const devDue = due && (manual || (await devRefreshDue(GITHUB_REPOSITORY, GITHUB_TOKEN, now)));
  appendFileSync(GITHUB_OUTPUT, `due=${due}\ndev_due=${devDue}\n`);
  appendFileSync(GITHUB_STEP_SUMMARY, due ? 'Snapshot refresh is due.\n' : 'This week already has a snapshot.\n');
  if (due) {
    appendFileSync(
      GITHUB_STEP_SUMMARY,
      devDue
        ? 'Cloud dev reloads from it.\n'
        : `Cloud dev keeps its data: a run reloaded it within the last ${DEV_REFRESH_AFTER_DAYS} days.\n`
    );
  }
}
