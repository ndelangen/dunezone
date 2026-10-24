import { appendFileSync } from 'node:fs';

const SHA = /^[0-9a-f]{40}$/;
const HEALTH_ENDPOINTS = ['https://dune.zone/__play/health', 'https://dune.zone/__asset-publisher/health'];

/** Pin the snapshot's code to the last completed release while the workflow holds the production lock. */
export async function productionSnapshotRevision(
  repository: string,
  token: string,
  request: typeof fetch = fetch
): Promise<string> {
  const response = await request(
    `https://api.github.com/repos/${repository}/actions/workflows/deploy-main.yml/runs?status=completed&per_page=20`,
    {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'error',
    }
  );
  if (!response.ok) {
    throw new Error('Cannot identify the completed production release; dev data was not touched');
  }
  const body = (await response.json()) as {
    workflow_runs?: Array<{ id?: number; conclusion?: string; head_sha?: string }>;
  };
  for (const run of body.workflow_runs ?? []) {
    const sha = run.head_sha;
    const runId = Number(run.id);
    if (!Number.isSafeInteger(runId) || runId <= 0 || !sha || !SHA.test(sha)) {
      throw new Error('Cannot identify the production release; dev data was not touched');
    }
    const jobsResponse = await request(
      `https://api.github.com/repos/${repository}/actions/runs/${encodeURIComponent(String(runId))}/jobs?per_page=100`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      }
    );
    if (!jobsResponse.ok) {
      throw new Error('Cannot inspect the production release; dev data was not touched');
    }
    const jobs = (await jobsResponse.json()) as { jobs?: Array<{ name?: string; conclusion?: string }> };
    const deploy = jobs.jobs?.find((job) => job.name === 'deploy');
    /* An old push may finish later with its deployment deliberately skipped. */
    if (deploy?.conclusion === 'skipped') {
      continue;
    }
    /* A failed dev sync must not prevent the weekly refresh that repairs dev. */
    if (deploy?.conclusion !== 'success') {
      throw new Error('Finish the failed production release before refreshing the snapshot; dev data was not touched');
    }
    await assertProductionRevision(sha, request);
    return sha;
  }
  throw new Error('Cannot identify the production release; dev data was not touched');
}

/** Refuse an older release sync rather than replacing dev code after production has advanced. */
export async function assertProductionRevision(sha: string, request: typeof fetch = fetch): Promise<void> {
  if (!SHA.test(sha)) {
    throw new Error('Expected a full production commit SHA');
  }
  await Promise.all(
    HEALTH_ENDPOINTS.map(async (endpoint) => {
      const health = await request(endpoint, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
      if (!health.ok) {
        throw new Error('Production health is unavailable; dev data was not touched');
      }
      const identity = (await health.json()) as { identity?: { gitSha?: string } };
      if (identity.identity?.gitSha !== sha) {
        throw new Error('Production Workers do not match the selected release; dev data was not touched');
      }
    })
  );
}

if (import.meta.main) {
  const { GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_STEP_SUMMARY, GITHUB_OUTPUT } = process.env;
  if (!GITHUB_REPOSITORY || !GITHUB_TOKEN || !GITHUB_OUTPUT || !GITHUB_STEP_SUMMARY) {
    throw new Error('Production revision selection requires a GitHub Actions environment');
  }
  const sha = process.argv.includes('--expect-current')
    ? (process.env.GITHUB_SHA ?? '')
    : await productionSnapshotRevision(GITHUB_REPOSITORY, GITHUB_TOKEN);
  if (process.argv.includes('--expect-current')) {
    await assertProductionRevision(sha);
  }
  appendFileSync(GITHUB_OUTPUT, `sha=${sha}\n`);
  appendFileSync(GITHUB_STEP_SUMMARY, `Snapshot source release: \`${sha}\`.\n`);
}
