import { appendFileSync } from 'node:fs';

type SnapshotRun = { event?: string; head_repository?: { full_name?: string } | null };

const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week holding `now`. */
export function snapshotWeekStart(now: Date): Date {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(midnight - ((now.getUTCDay() + 6) % 7) * DAY);
}

/** Cloud dev reloads the snapshot once every this many weeks; the weeks between export only the local snapshot. */
export const DEV_REFRESH_EVERY_WEEKS = 4;

/* Cloud dev last reloaded on Monday 16 November 2026; the four-week periods count from that week. */
const DEV_REFRESH_ANCHOR = Date.UTC(2026, 10, 16);

/**
 * Whether this week's snapshot also reloads cloud dev.
 * A reload replays every required migration over the whole snapshot, which read 160 to 190 MB of dev database I/O each week in November 2026, about a third of the month's usage, so cloud dev reloads on every fourth week and its data can be up to four weeks old (Norbert, 22 November 2026).
 * The week is the same one `snapshotRefreshDue` settles, so a failed Monday that recovers later that week still reloads dev.
 */
export function devRefreshWeek(now: Date): boolean {
  const weeks = Math.round((snapshotWeekStart(now).getTime() - DEV_REFRESH_ANCHOR) / (7 * DAY));
  return ((weeks % DEV_REFRESH_EVERY_WEEKS) + DEV_REFRESH_EVERY_WEEKS) % DEV_REFRESH_EVERY_WEEKS === 0;
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
  const devDue = due && (manual || devRefreshWeek(now));
  appendFileSync(GITHUB_OUTPUT, `due=${due}\ndev_due=${devDue}\n`);
  appendFileSync(GITHUB_STEP_SUMMARY, due ? 'Snapshot refresh is due.\n' : 'This week already has a snapshot.\n');
  if (due) {
    appendFileSync(
      GITHUB_STEP_SUMMARY,
      devDue
        ? 'Cloud dev reloads from it.\n'
        : `Cloud dev keeps its data; it reloads every ${DEV_REFRESH_EVERY_WEEKS} weeks.\n`
    );
  }
}
