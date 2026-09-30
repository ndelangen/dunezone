import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, utimesSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { z } from 'zod';

import { SNAPSHOT_FILE } from './anonymised-snapshot';
import { verifySnapshotFile } from './snapshot-anonymise';

/**
 * Finds the anonymised snapshot that `app:dev --local --data=snapshot` loads (#1559).
 *
 * A file the caller names is used as it is.
 * Otherwise the newest artifact the snapshot job uploaded from main is downloaded with the GitHub CLI, checked, and cached outside the checkout.
 * A cached download is used for at most seven days after the job made it, and older ones are deleted on the next launch.
 */

const REPOSITORY = 'ndelangen/dunezone';
const WORKFLOW_PATH = '.github/workflows/anonymised-snapshot.yml';
const ARTIFACT_NAME = 'anonymised-snapshot';

/* The job's own triggers. A pull request can run an edited copy of the workflow, and its artifact never counts. */
const JOB_EVENTS: ReadonlySet<string> = new Set(['schedule', 'workflow_dispatch']);

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ROOT_DIRECTORY = path.resolve(import.meta.dirname, '..');

const FIXTURE_HINT =
  'Start from fixtures with `bun run app:dev --local --data=fixture`, or pass `--snapshot-file <zip>`.';

/** Runs the GitHub CLI with these arguments and returns its output, or throws with its reason. */
export type GitHubCli = (args: readonly string[]) => string;

export const githubCli: GitHubCli = (args) => {
  const result = spawnSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.error) {
    throw new Error(`the GitHub CLI (gh) did not run: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`gh ${args[0]} failed: ${result.stderr.trim() || `status ${result.status}`}`);
  }
  return result.stdout;
};

const artifactListing = z.object({
  artifacts: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      expired: z.boolean(),
      created_at: z.string(),
      workflow_run: z
        .object({
          id: z.number(),
          repository_id: z.number(),
          head_repository_id: z.number(),
          head_branch: z.string().nullable(),
        })
        .nullable(),
    })
  ),
});

const workflowRun = z.object({
  path: z.string(),
  event: z.string(),
  head_branch: z.string().nullable(),
  status: z.string().nullable(),
  conclusion: z.string().nullable(),
  repository: z.object({ full_name: z.string() }),
  head_repository: z.object({ full_name: z.string() }).nullable(),
});

export type SnapshotArtifact = { artifactId: number; runId: number; createdAt: number };

/** Whether a run is the snapshot job itself, run on main of this repository by its own triggers, and finished green. */
function isSnapshotJobRun(run: z.infer<typeof workflowRun>) {
  return (
    run.path === WORKFLOW_PATH &&
    JOB_EVENTS.has(run.event) &&
    run.head_branch === 'main' &&
    run.repository.full_name === REPOSITORY &&
    run.head_repository?.full_name === REPOSITORY &&
    run.status === 'completed' &&
    run.conclusion === 'success'
  );
}

/**
 * The newest live snapshot artifact that the snapshot job uploaded, or null when there is none.
 * Any artifact of that name from another workflow, event, branch or fork is passed over.
 */
export function latestSnapshotArtifact(github: GitHubCli): SnapshotArtifact | null {
  const { artifacts } = artifactListing.parse(
    JSON.parse(github(['api', `repos/${REPOSITORY}/actions/artifacts?name=${ARTIFACT_NAME}&per_page=30`]))
  );
  const candidates = artifacts
    .filter(
      (artifact) =>
        artifact.name === ARTIFACT_NAME &&
        !artifact.expired &&
        artifact.workflow_run !== null &&
        artifact.workflow_run.head_branch === 'main' &&
        artifact.workflow_run.head_repository_id === artifact.workflow_run.repository_id
    )
    .map((artifact) => ({
      artifactId: artifact.id,
      runId: artifact.workflow_run!.id,
      createdAt: Date.parse(artifact.created_at),
    }))
    .filter((artifact) => Number.isFinite(artifact.createdAt))
    .sort((left, right) => right.createdAt - left.createdAt);
  for (const candidate of candidates) {
    const run = workflowRun.parse(JSON.parse(github(['api', `repos/${REPOSITORY}/actions/runs/${candidate.runId}`])));
    if (isSnapshotJobRun(run)) {
      return candidate;
    }
  }
  return null;
}

/** Where downloads are cached: under XDG_CACHE_HOME or ~/.cache, and never inside this checkout. */
export function snapshotCacheDirectory(env: NodeJS.ProcessEnv): string {
  const configured = env.XDG_CACHE_HOME?.trim();
  const base = configured && path.isAbsolute(configured) ? configured : path.join(homedir(), '.cache');
  const directory = path.join(base, 'dunezone', 'anonymised-snapshot');
  const fromRoot = path.relative(ROOT_DIRECTORY, directory);
  if (!fromRoot.startsWith('..') && !path.isAbsolute(fromRoot)) {
    throw new Error(`The snapshot cache ${directory} would sit inside this checkout; set XDG_CACHE_HOME outside it`);
  }
  return directory;
}

const cachedFile = (directory: string, artifactId: number) => path.join(directory, `snapshot-${artifactId}.zip`);

/** Deletes everything in the cache that is older than seven days, counted from when the job made the snapshot. */
function pruneCache(directory: string, now: number) {
  for (const name of readdirSync(directory)) {
    const entry = path.join(directory, name);
    if (now - statSync(entry).mtimeMs > CACHE_MAX_AGE_MS) {
      rmSync(entry, { recursive: true, force: true });
    }
  }
}

function newestCachedFile(directory: string): string | null {
  const files = readdirSync(directory)
    .filter((name) => /^snapshot-\d+\.zip$/.test(name))
    .map((name) => path.join(directory, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return files[0] ?? null;
}

/**
 * Downloads the artifact into a staging directory in the cache, checks it, and only then moves it into the cache.
 * The cached file's modification time is set to when the job made it, so the seven days count from then.
 */
function downloadSnapshot(github: GitHubCli, artifact: SnapshotArtifact, directory: string): string {
  const staging = mkdtempSync(path.join(directory, 'download-'));
  try {
    github([
      'run',
      'download',
      String(artifact.runId),
      '--repo',
      REPOSITORY,
      '--name',
      ARTIFACT_NAME,
      '--dir',
      staging,
    ]);
    const files = readdirSync(staging);
    if (files.length !== 1 || files[0] !== SNAPSHOT_FILE) {
      throw new Error(`The snapshot artifact does not hold ${SNAPSHOT_FILE} alone, so it was not loaded`);
    }
    const downloaded = path.join(staging, SNAPSHOT_FILE);
    verifySnapshotFile(downloaded);
    const cached = cachedFile(directory, artifact.artifactId);
    renameSync(downloaded, cached);
    const createdAt = new Date(artifact.createdAt);
    utimesSync(cached, createdAt, createdAt);
    return cached;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

type SnapshotRequest = {
  /** A file the caller named with --snapshot-file, or null to use the newest artifact. */
  snapshotFile: string | null;
  cacheDirectory: string;
  now: number;
  github: GitHubCli;
};

/**
 * The snapshot file a local launch loads.
 * When the newest artifact cannot be looked up or none is left, a cached download younger than seven days stands in, and without one the launch stops.
 */
export function resolveLocalSnapshot({ snapshotFile, cacheDirectory, now, github }: SnapshotRequest): string {
  if (snapshotFile !== null) {
    return path.resolve(snapshotFile);
  }
  mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
  pruneCache(cacheDirectory, now);

  let artifact: SnapshotArtifact | null = null;
  let lookupFailure: string | null = null;
  try {
    artifact = latestSnapshotArtifact(github);
  } catch (error) {
    lookupFailure = error instanceof Error ? error.message : 'the lookup failed';
  }
  const created = (time: number) => new Date(time).toISOString();
  if (artifact) {
    const cached = cachedFile(cacheDirectory, artifact.artifactId);
    if (existsSync(cached)) {
      console.log(`Using the anonymised snapshot from ${created(artifact.createdAt)}, cached in ${cacheDirectory}.`);
      return cached;
    }
    console.log(`Downloading the anonymised snapshot from ${created(artifact.createdAt)}...`);
    return downloadSnapshot(github, artifact, cacheDirectory);
  }

  const fallback = newestCachedFile(cacheDirectory);
  const reason = lookupFailure ?? 'no snapshot artifact is available';
  if (fallback) {
    console.log(`Using the cached snapshot from ${created(statSync(fallback).mtimeMs)}, because ${reason}.`);
    return fallback;
  }
  throw new Error(
    lookupFailure
      ? `Could not look up the anonymised snapshot: ${lookupFailure}. ${FIXTURE_HINT}`
      : `No anonymised snapshot is available. The snapshot job keeps each upload for one day, and uploads only while its SNAPSHOT_UPLOAD switch is on. ${FIXTURE_HINT}`
  );
}
