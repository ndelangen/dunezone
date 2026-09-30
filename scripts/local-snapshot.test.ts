import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { GitHubCli } from './local-snapshot';
import { CACHE_MAX_AGE_MS, latestSnapshotArtifact, resolveLocalSnapshot } from './local-snapshot';

const JOB = '.github/workflows/anonymised-snapshot.yml';
const REPOSITORY = { full_name: 'ndelangen/dunezone' };
const NOW = Date.parse('2026-09-30T12:00:00Z');

function artifact(id: number, runId: number, createdAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: 'anonymised-snapshot',
    expired: false,
    created_at: createdAt,
    workflow_run: { id: runId, repository_id: 1, head_repository_id: 1, head_branch: 'main' },
    ...overrides,
  };
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    path: JOB,
    event: 'schedule',
    head_branch: 'main',
    status: 'completed',
    conclusion: 'success',
    repository: REPOSITORY,
    head_repository: REPOSITORY,
    ...overrides,
  };
}

/** A GitHub CLI that answers the two API reads from these listings and refuses anything else. */
function fakeGitHub(artifacts: unknown[], runs: Record<number, unknown>): GitHubCli {
  return (args) => {
    const [command, endpoint] = args;
    if (command === 'api' && endpoint?.includes('/actions/artifacts?')) {
      return JSON.stringify({ artifacts });
    }
    const runId = /\/actions\/runs\/(\d+)$/.exec(endpoint ?? '')?.[1];
    if (command === 'api' && runId && runs[Number(runId)]) {
      return JSON.stringify(runs[Number(runId)]);
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
}

describe('latestSnapshotArtifact', () => {
  test('takes the newest artifact the snapshot job uploaded from main, and no copy a pull request or fork made', () => {
    const github = fakeGitHub(
      [
        artifact(6, 60, '2026-09-30T09:00:00Z', {
          workflow_run: { id: 60, repository_id: 1, head_repository_id: 2, head_branch: 'main' },
        }),
        artifact(5, 50, '2026-09-30T08:00:00Z'),
        artifact(4, 40, '2026-09-30T07:00:00Z'),
        artifact(3, 30, '2026-09-30T06:00:00Z', { expired: true }),
        artifact(2, 20, '2026-09-30T05:17:00Z'),
      ],
      {
        50: run({ event: 'pull_request' }),
        40: run({ path: '.github/workflows/ci-pr.yml' }),
        30: run(),
        20: run(),
      }
    );

    expect(latestSnapshotArtifact(github)).toEqual({
      artifactId: 2,
      runId: 20,
      createdAt: Date.parse('2026-09-30T05:17:00Z'),
    });
  });
});

describe('resolveLocalSnapshot', () => {
  const directories: string[] = [];
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
  });

  function cacheWith(files: Record<string, number>) {
    const directory = mkdtempSync(path.join(tmpdir(), 'snapshot-cache-'));
    directories.push(directory);
    for (const [name, age] of Object.entries(files)) {
      const file = path.join(directory, name);
      writeFileSync(file, 'cached');
      utimesSync(file, new Date(NOW - age), new Date(NOW - age));
    }
    return directory;
  }

  const day = 24 * 60 * 60 * 1000;

  test('reuses the cached download of the newest artifact', () => {
    const cacheDirectory = cacheWith({ 'snapshot-2.zip': day });
    const github = fakeGitHub([artifact(2, 20, new Date(NOW - day).toISOString())], { 20: run() });

    expect(resolveLocalSnapshot({ snapshotFile: null, cacheDirectory, now: NOW, github })).toBe(
      path.join(cacheDirectory, 'snapshot-2.zip')
    );
  });

  test('keeps a download for at most seven days, and without one points at fixtures', () => {
    const noArtifact = fakeGitHub([], {});
    const recent = cacheWith({ 'snapshot-1.zip': 6 * day, 'snapshot-0.zip': CACHE_MAX_AGE_MS + 1 });

    expect(resolveLocalSnapshot({ snapshotFile: null, cacheDirectory: recent, now: NOW, github: noArtifact })).toBe(
      path.join(recent, 'snapshot-1.zip')
    );
    expect(existsSync(path.join(recent, 'snapshot-0.zip'))).toBe(false);

    const expired = cacheWith({ 'snapshot-1.zip': CACHE_MAX_AGE_MS + 1 });
    expect(() =>
      resolveLocalSnapshot({ snapshotFile: null, cacheDirectory: expired, now: NOW, github: noArtifact })
    ).toThrow('--data=fixture');
    expect(existsSync(path.join(expired, 'snapshot-1.zip'))).toBe(false);
  });
});
