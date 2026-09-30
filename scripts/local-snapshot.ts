import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { SNAPSHOT_FILE } from './anonymised-snapshot';
import { verifySnapshotFile } from './snapshot-anonymise';

/**
 * Finds the anonymised snapshot that `app:dev --local --data=snapshot` loads (#1559), and checks it before Docker starts.
 *
 * A file the caller names is used where it is, and stays there.
 * Otherwise the newest artifact the snapshot job uploaded from main is downloaded with the GitHub CLI into the launch's private temporary directory.
 * The launch deletes that download as soon as the import has finished or failed, so no copy outlives the one-day artifact, and nothing is cached between launches.
 */

const REPOSITORY = 'ndelangen/dunezone';
const WORKFLOW_PATH = '.github/workflows/anonymised-snapshot.yml';
const ARTIFACT_NAME = 'anonymised-snapshot';

/* The job's own triggers. A pull request can run an edited copy of the workflow, and its artifact never counts. */
const JOB_EVENTS: ReadonlySet<string> = new Set(['schedule', 'workflow_dispatch']);

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

type SnapshotArtifact = { artifactId: number; runId: number; createdAt: number };

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

/** The snapshot a local launch loads. */
export type LocalSnapshot = {
  file: string;
  /** The directory this launch downloaded the file into, which it deletes after the import, or null for a file the caller named. */
  downloadDirectory: string | null;
};

/** The newest artifact, or a stop that points at fixtures when it cannot be looked up or none is left. */
function newestArtifact(github: GitHubCli): SnapshotArtifact {
  let artifact: SnapshotArtifact | null;
  try {
    artifact = latestSnapshotArtifact(github);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'the lookup failed';
    throw new Error(`Could not look up the anonymised snapshot: ${reason}. ${FIXTURE_HINT}`);
  }
  if (!artifact) {
    throw new Error(
      `No anonymised snapshot is available. The snapshot job keeps each upload for one day, and uploads only while its SNAPSHOT_UPLOAD switch is on. ${FIXTURE_HINT}`
    );
  }
  return artifact;
}

/** Downloads the artifact into a new directory under `temporaryDirectory` and checks it, deleting the directory again if either fails. */
function downloadSnapshot(github: GitHubCli, artifact: SnapshotArtifact, temporaryDirectory: string): LocalSnapshot {
  const directory = mkdtempSync(path.join(temporaryDirectory, 'anonymised-snapshot-'));
  try {
    console.log(`Downloading the anonymised snapshot from ${new Date(artifact.createdAt).toISOString()}...`);
    github([
      'run',
      'download',
      String(artifact.runId),
      '--repo',
      REPOSITORY,
      '--name',
      ARTIFACT_NAME,
      '--dir',
      directory,
    ]);
    const files = readdirSync(directory);
    if (files.length !== 1 || files[0] !== SNAPSHOT_FILE) {
      throw new Error(`The snapshot artifact does not hold ${SNAPSHOT_FILE} alone, so it was not loaded`);
    }
    const file = path.join(directory, SNAPSHOT_FILE);
    verifySnapshotFile(file);
    return { file, downloadDirectory: directory };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

type SnapshotRequest = {
  /** A file the caller named with --snapshot-file, or null to download the newest artifact. */
  snapshotFile: string | null;
  /** The launch's private temporary directory, which its supervisor deletes when the launch exits. */
  temporaryDirectory: string;
  github: GitHubCli;
};

/** The snapshot a local launch loads, which `verifySnapshot` must accept, so a launch refuses a file before it resets local Convex. */
export function resolveLocalSnapshot({ snapshotFile, temporaryDirectory, github }: SnapshotRequest): LocalSnapshot {
  if (snapshotFile === null) {
    return downloadSnapshot(github, newestArtifact(github), temporaryDirectory);
  }
  const file = path.resolve(snapshotFile);
  verifySnapshotFile(file);
  return { file, downloadDirectory: null };
}

/** Deletes a snapshot this launch downloaded. A file the caller named stays where it is. */
export function discardDownloadedSnapshot(snapshot: LocalSnapshot) {
  if (snapshot.downloadDirectory !== null) {
    rmSync(snapshot.downloadDirectory, { recursive: true, force: true });
  }
}
