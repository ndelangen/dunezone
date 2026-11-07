import { appendFileSync } from 'node:fs';

/*
 * Decides, before anything deploys, whether a production deploy run goes ahead.
 * Each production Worker reports the commit it was deployed from on a public health endpoint, and GitHub's compare API says whether that commit comes before or after GITHUB_SHA.
 * The gate asks GitHub instead of a local clone: deepening the job's shallow checkout with a commits-only filter crashed git itself (#2721), and the API needs no history at all.
 * When both already report GITHUB_SHA, the Actions API says whether an earlier run of this workflow finished that release.
 * The release_gate job in .github/workflows/deploy-main.yml says why an older commit can reach this point.
 * Only a positive answer stops a run.
 * An endpoint that cannot be read, a commit GitHub cannot place, or an Actions API that cannot be read lets the deploy go ahead, because refusing then would also block the release that repairs a broken endpoint or finishes a failed one.
 * A compare API that never answers fails the gate instead, as the history fetch it replaced did, because only it can tell an older commit from a newer one.
 * This script imports no packages, so the job that runs it skips the dependency install.
 */

const HEALTH_ENDPOINTS = ['https://dune.zone/__play/health', 'https://dune.zone/__asset-publisher/health'];
const WORKFLOW = 'deploy-main.yml';
const FULL_SHA = /^[0-9a-f]{40}$/;

/** Where one Worker's commit sits against the commit this run would deploy; unknown when it could not be read or compared. */
export type Position = 'same' | 'newer' | 'older' | 'unknown';

export type Reading = { endpoint: string; sha?: string; position: Position; note?: string };

/** Unread marks a deploy that went ahead only because the Actions API could not say, so the log raises it as a warning. */
type Decision = { deploy: boolean; base: string; reason: string; unread?: true };

/**
 * This run as GitHub's environment describes it, and the request function the gate reaches the Actions API with.
 * The other fields come from GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_TOKEN, GITHUB_SHA and GITHUB_RUN_ID.
 * In a run the request function is fetch, and a test passes its own to answer for GitHub.
 * The gate makes two kinds of request with it: the compare API for where production's commits sit, and the Actions API for earlier runs.
 */
export type GitHub = {
  api: string;
  repository: string;
  token: string;
  head: string;
  run: number;
  request: (url: string, init: RequestInit) => Promise<Response>;
  /** The pause before the compare API is asked again; a test sets it to 0. */
  retryDelayMs?: number;
};

/**
 * One Worker already on a later commit stops the run on every attempt, since deploying would move that Worker back.
 * Every Worker already on this commit stops only a first attempt, and only once an earlier run of this workflow finished green on this commit, as a duplicate of a release that is out.
 * A first attempt whose earlier run failed after both Workers went out deploys again, which finishes that release.
 * A later attempt reaches the gate only when someone reruns it, usually with "Re-run all jobs" to finish a deploy that failed after both Workers went out, so it deploys this commit again.
 * When every Worker reports the same earlier commit, that commit is the base the dev rebuild measures its change range from.
 * When they report different earlier commits, the one the others descend from is the base.
 */
export async function decide(readings: readonly Reading[], attempt: number, github: GitHub): Promise<Decision> {
  const ahead = readings.find((reading) => reading.position === 'newer');
  if (ahead) {
    return { deploy: false, base: '', reason: `${ahead.endpoint} already reports ${ahead.sha}, a later commit` };
  }
  if (readings.length > 0 && readings.every((reading) => reading.position === 'same')) {
    return attempt === 1
      ? duplicate(await earlierRelease(github))
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
  /* A run that failed between the two Worker deploys leaves them on different earlier commits; the dev rebuild measures from the older one, so the failed run's own changes stay in range. */
  const oldest = earlier.has(undefined) ? undefined : await oldestOf([...earlier] as string[], github);
  if (oldest !== undefined) {
    return { deploy: true, base: oldest, reason: `production reports earlier commits, the oldest being ${oldest}` };
  }
  return {
    deploy: true,
    base: '',
    reason: 'no production Worker reports a later commit, and not every one reports this one',
  };
}

/** The ID of an earlier run that finished this commit green, a note on why the Actions API could not say, or neither when no run has finished it. */
type Lookup = { run?: number; note?: string };

function duplicate(lookup: Lookup): Decision {
  const reason = 'every production Worker already reports this commit';
  switch (true) {
    case lookup.run !== undefined:
      return { deploy: false, base: '', reason: `${reason}, and run ${lookup.run} already finished it green` };
    case lookup.note !== undefined:
      return {
        deploy: true,
        base: '',
        reason: `${reason}, and the Actions API could not say whether an earlier run finished it (${lookup.note})`,
        unread: true,
      };
    default:
      return { deploy: true, base: '', reason: `${reason}, but no earlier run of this workflow finished it green` };
  }
}

/**
 * Lists this workflow's runs for the commit and finds one that completed with conclusion success.
 * The list holds this run too, so it is left out by its ID, and a run still queued or in progress has no conclusion yet, so it does not count.
 * Each run is checked against the commit as well, so a head_sha filter the API dropped cannot pass off another commit's run.
 * A commit has a handful of runs, so the first page of a hundred holds them all.
 * The notes are fixed text, so nothing the API returns reaches the log except a run ID.
 */
async function earlierRelease(github: GitHub): Promise<Lookup> {
  const url = `${github.api}/repos/${github.repository}/actions/workflows/${WORKFLOW}/runs?head_sha=${github.head}&per_page=100`;
  let response: Response;
  try {
    response = await github.request(url, {
      headers: headers(github),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { note: 'no answer' };
  }
  if (response.status !== 200) {
    return { note: `HTTP ${response.status}` };
  }
  const body: unknown = await response.json().catch(() => undefined);
  const runs = typeof body === 'object' && body !== null && 'workflow_runs' in body ? body.workflow_runs : undefined;
  if (!Array.isArray(runs)) {
    return { note: 'no list of runs in the answer' };
  }
  return { run: runs.find((run: unknown) => finishedGreen(run, github))?.id };
}

function finishedGreen(run: unknown, github: GitHub): run is { id: number } {
  return (
    typeof run === 'object' &&
    run !== null &&
    'id' in run &&
    typeof run.id === 'number' &&
    run.id !== github.run &&
    'head_sha' in run &&
    run.head_sha === github.head &&
    'status' in run &&
    run.status === 'completed' &&
    'conclusion' in run &&
    run.conclusion === 'success'
  );
}

function headers(github: GitHub): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(github.token ? { Authorization: `Bearer ${github.token}` } : {}),
  };
}

/** How GitHub's compare API places head against base, as its status field says. */
type Comparison = 'identical' | 'ahead' | 'behind' | 'diverged';
const COMPARE_ATTEMPTS = 3;

/**
 * Asks GitHub's compare API where head sits against base.
 * Only full SHAs reach the URL, so a short or path-shaped value cannot name another commit or another endpoint.
 * A commit GitHub does not have answers 404, which reads as undefined, the way git once answered for a commit missing from the checkout.
 * Any other failure is retried twice and then fails the gate, which skips the deploy: an unread answer must not let an older commit replace a newer one.
 */
async function compare(base: string, head: string, github: GitHub): Promise<Comparison | undefined> {
  if (!FULL_SHA.test(base) || !FULL_SHA.test(head)) {
    return undefined;
  }
  const url = `${github.api}/repos/${github.repository}/compare/${base}...${head}?per_page=1`;
  let failure = '';
  for (let attempt = 1; attempt <= COMPARE_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, github.retryDelayMs ?? 2000));
    }
    let response: Response;
    try {
      response = await github.request(url, {
        headers: headers(github),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      failure = 'no answer';
      continue;
    }
    if (response.status === 404) {
      return undefined;
    }
    const body: unknown = response.status === 200 ? await response.json().catch(() => undefined) : undefined;
    const status = typeof body === 'object' && body !== null && 'status' in body ? body.status : undefined;
    if (status === 'identical' || status === 'ahead' || status === 'behind' || status === 'diverged') {
      return status;
    }
    failure = response.status === 200 ? 'no status in the answer' : `HTTP ${response.status}`;
  }
  throw new Error(`GitHub's compare API could not place ${base} against ${head} (${failure})`);
}

/** Whether descendant contains ancestor in its history, or undefined when GitHub could not say. */
async function isAncestor(ancestor: string, descendant: string, github: GitHub): Promise<boolean | undefined> {
  const found = await compare(ancestor, descendant, github);
  return found === undefined ? undefined : found === 'ahead' || found === 'identical';
}

/** The commit every other one descends from, or undefined when GitHub cannot order them all. */
async function oldestOf(commits: readonly string[], github: GitHub): Promise<string | undefined> {
  for (const candidate of commits) {
    const answers = await Promise.all(
      commits.filter((other) => other !== candidate).map((other) => isAncestor(candidate, other, github))
    );
    if (answers.every((answer) => answer === true)) {
      return candidate;
    }
  }
  return undefined;
}

/** Where production's commit sits against head, the commit this run would deploy. */
export async function position(head: string, production: string, github: GitHub): Promise<Position> {
  if (production === head) {
    return 'same';
  }
  switch (await compare(production, head, github)) {
    case 'ahead':
      return 'older';
    case 'behind':
      return 'newer';
    default:
      return 'unknown';
  }
}

/** The notes are fixed text, so nothing an endpoint returns reaches the log except a validated SHA. */
async function read(endpoint: string, github: GitHub): Promise<Reading> {
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
  const found = await position(github.head, sha, github);
  return {
    endpoint,
    sha,
    position: found,
    note: found === 'unknown' ? 'GitHub cannot place it against this commit' : undefined,
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
  // The release_gate step passes GITHUB_TOKEN and GitHub sets the rest; unset, as in a local run, the lookups read the public repository without a token and leave no run out.
  const github: GitHub = {
    api: process.env.GITHUB_API_URL ?? 'https://api.github.com',
    repository: process.env.GITHUB_REPOSITORY ?? 'ndelangen/dunezone',
    token: process.env.GITHUB_TOKEN ?? '',
    head,
    run: Number(process.env.GITHUB_RUN_ID ?? '0'),
    request: fetch,
  };
  const readings = await Promise.all(HEALTH_ENDPOINTS.map((endpoint) => read(endpoint, github)));
  for (const reading of readings) {
    const line = `${reading.endpoint}: ${reading.sha ?? 'no commit'} (${reading.position}${reading.note ? `, ${reading.note}` : ''})`;
    console.log(reading.position === 'unknown' ? `::warning::${line}` : line);
  }
  const decision = await decide(readings, attempt, github);
  console.log(
    decision.deploy
      ? `${decision.unread ? '::warning::' : ''}Deploying ${head}: ${decision.reason}.`
      : `::notice::Not deploying ${head}: ${decision.reason}.`
  );
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${decision.deploy}\nbase=${decision.base}\n`);
  }
}
