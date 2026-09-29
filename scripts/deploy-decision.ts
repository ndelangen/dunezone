import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/*
 * Decides, before anything deploys, whether a production deploy run goes ahead.
 * Each production Worker reports the commit it was deployed from on a public health endpoint, and git history says whether that commit comes before or after GITHUB_SHA.
 * The release_gate job in .github/workflows/deploy-main.yml says why an older commit can reach this point.
 * Only a positive answer stops a run.
 * An endpoint that cannot be read, or a commit git cannot place, lets the deploy go ahead, because refusing then would also block the release that repairs a broken endpoint.
 * This script imports no packages, so the job that runs it skips the dependency install.
 */

const HEALTH_ENDPOINTS = ['https://dune.zone/__play/health', 'https://dune.zone/__asset-publisher/health'];
const FULL_SHA = /^[0-9a-f]{40}$/;

/** Where one Worker's commit sits against the commit this run would deploy; unknown when it could not be read or compared. */
export type Position = 'same' | 'newer' | 'older' | 'unknown';

export type Reading = { endpoint: string; sha?: string; position: Position; note?: string };

type Decision = { deploy: boolean; base: string; reason: string };

/**
 * One Worker already on a later commit stops the run on every attempt, since deploying would move that Worker back.
 * Every Worker already on this commit stops only the first attempt, as a duplicate of a release that is out.
 * A later attempt reaches the gate only when someone reruns it, usually with "Re-run all jobs" to finish a deploy that failed after both Workers went out, so it deploys this commit again.
 * When every Worker reports the same earlier commit, that commit is the base the dev rebuild measures its change range from.
 */
export function decide(readings: readonly Reading[], attempt: number): Decision {
  const ahead = readings.find((reading) => reading.position === 'newer');
  if (ahead) {
    return { deploy: false, base: '', reason: `${ahead.endpoint} already reports ${ahead.sha}, a later commit` };
  }
  if (readings.length > 0 && readings.every((reading) => reading.position === 'same')) {
    return attempt === 1
      ? { deploy: false, base: '', reason: 'every production Worker already reports this commit' }
      : {
          deploy: true,
          base: '',
          reason: `every production Worker already reports this commit, and attempt ${attempt} is a rerun`,
        };
  }
  const earlier = new Set(readings.map((reading) => (reading.position === 'older' ? reading.sha : undefined)));
  const [base] = earlier;
  if (earlier.size === 1 && base !== undefined) {
    return { deploy: true, base, reason: `production reports the earlier commit ${base}` };
  }
  return {
    deploy: true,
    base: '',
    reason: 'no production Worker reports a later commit, and not every one reports this one',
  };
}

/** Exit 0 and 1 answer the question; any other status means git could not compare the two, usually because the commit is not in this checkout. */
function isAncestor(ancestor: string, descendant: string, repository: string): boolean | undefined {
  const { status } = spawnSync('/usr/bin/git', ['merge-base', '--is-ancestor', ancestor, descendant], {
    cwd: repository,
  });
  switch (status) {
    case 0:
      return true;
    case 1:
      return false;
    default:
      return undefined;
  }
}

/** Where production's commit sits against head in the history of the git checkout at repository. */
export function position(head: string, production: string, repository: string): Position {
  switch (true) {
    case production === head:
      return 'same';
    case isAncestor(head, production, repository):
      return 'newer';
    case isAncestor(production, head, repository):
      return 'older';
    default:
      return 'unknown';
  }
}

/** The notes are fixed text, so nothing an endpoint returns reaches the log except a validated SHA. */
async function read(endpoint: string, head: string, repository: string): Promise<Reading> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { endpoint, position: 'unknown', note: 'no answer' };
  }
  if (response.status !== 200) {
    return { endpoint, position: 'unknown', note: `HTTP ${response.status}` };
  }
  const body: unknown = await response.json().catch(() => undefined);
  const identity = typeof body === 'object' && body !== null && 'identity' in body ? body.identity : undefined;
  const sha = typeof identity === 'object' && identity !== null && 'gitSha' in identity ? identity.gitSha : undefined;
  if (typeof sha !== 'string' || !FULL_SHA.test(sha)) {
    return { endpoint, position: 'unknown', note: 'no commit SHA in the answer' };
  }
  const found = position(head, sha, repository);
  return {
    endpoint,
    sha,
    position: found,
    note: found === 'unknown' ? 'git cannot place it against this commit' : undefined,
  };
}

if (import.meta.main) {
  const head = process.env.GITHUB_SHA?.trim() ?? '';
  if (!FULL_SHA.test(head)) {
    throw new Error('GITHUB_SHA must be a full Git SHA');
  }
  // GitHub sets it on every run; unset, as in a local run, reads as a first attempt.
  const attempt = Number(process.env.GITHUB_RUN_ATTEMPT ?? '1');
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('GITHUB_RUN_ATTEMPT must be a positive whole number');
  }
  const repository = process.cwd();
  const readings = await Promise.all(HEALTH_ENDPOINTS.map((endpoint) => read(endpoint, head, repository)));
  for (const reading of readings) {
    const line = `${reading.endpoint}: ${reading.sha ?? 'no commit'} (${reading.position}${reading.note ? `, ${reading.note}` : ''})`;
    console.log(reading.position === 'unknown' ? `::warning::${line}` : line);
  }
  const decision = decide(readings, attempt);
  console.log(
    decision.deploy ? `Deploying ${head}: ${decision.reason}.` : `::notice::Not deploying ${head}: ${decision.reason}.`
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${decision.deploy}\nbase=${decision.base}\n`);
  }
}
