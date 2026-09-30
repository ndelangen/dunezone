import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { GitHubCli } from './local-snapshot';
import { discardDownloadedSnapshot, latestSnapshotArtifact, resolveLocalSnapshot } from './local-snapshot';
import { writtenSnapshot } from './snapshot-anonymise.test.fixture';

const JOB = '.github/workflows/anonymised-snapshot.yml';
const REPOSITORY = { full_name: 'ndelangen/dunezone' };

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

/**
 * A GitHub CLI that answers the two API reads from these listings, hands `download` the directory of a `run download`, and refuses anything else.
 */
function fakeGitHub(
  artifacts: unknown[],
  runs: Record<number, unknown>,
  download: (directory: string) => void = () => undefined
): GitHubCli {
  return (args) => {
    const [command, endpoint] = args;
    if (command === 'api' && endpoint?.includes('/actions/artifacts?')) {
      return JSON.stringify({ artifacts });
    }
    const runId = /\/actions\/runs\/(\d+)$/.exec(endpoint ?? '')?.[1];
    if (command === 'api' && runId && runs[Number(runId)]) {
      return JSON.stringify(runs[Number(runId)]);
    }
    if (command === 'run' && endpoint === 'download') {
      download(args[args.indexOf('--dir') + 1]!);
      return '';
    }
    throw new Error(`unexpected gh ${args.join(' ')}`);
  };
}

describe('latestSnapshotArtifact', () => {
  test('takes the newest artifact the snapshot job uploaded green from main, and no copy a pull request or fork made', () => {
    const github = fakeGitHub(
      [
        artifact(7, 70, '2026-09-30T10:00:00Z'),
        artifact(6, 60, '2026-09-30T09:00:00Z', {
          workflow_run: { id: 60, repository_id: 1, head_repository_id: 2, head_branch: 'main' },
        }),
        artifact(5, 50, '2026-09-30T08:00:00Z'),
        artifact(4, 40, '2026-09-30T07:00:00Z'),
        artifact(3, 30, '2026-09-30T06:00:00Z', { expired: true }),
        artifact(2, 20, '2026-09-30T05:17:00Z'),
      ],
      {
        70: run({ conclusion: 'failure' }),
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
  const directory = (prefix: string) => {
    const created = mkdtempSync(path.join(tmpdir(), prefix));
    directories.push(created);
    return created;
  };
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    directories.splice(0).forEach((created) => rmSync(created, { recursive: true, force: true }));
  });

  /** A snapshot the anonymiser wrote from a synthetic export holding `factions` published factions. */
  const snapshot = (factions: number) =>
    writtenSnapshot(path.join(directory('snapshot-source-'), 'snapshot.zip'), factions);

  /** A zip in `convex export` layout with no anonymiser manifest, holding a made-up account. */
  function rawExport() {
    const staging = directory('raw-export-');
    mkdirSync(path.join(staging, '_tables'));
    mkdirSync(path.join(staging, 'users'));
    writeFileSync(path.join(staging, '_tables', 'documents.jsonl'), '{"name":"users","id":10001}\n');
    writeFileSync(path.join(staging, 'users', 'documents.jsonl'), '{"email":"someone@example.com"}\n');
    const file = path.join(directory('raw-export-zip-'), 'export.zip');
    spawnSync('/usr/bin/zip', ['-q', '-r', file, '_tables', 'users'], { cwd: staging });
    return file;
  }

  const newest = [artifact(2, 20, '2026-09-30T05:17:00Z')];

  test('downloads the newest snapshot for one launch, and discarding it deletes the download but never a named file', () => {
    const source = snapshot(1);
    const temporaryDirectory = directory('launch-');
    const github = fakeGitHub(newest, { 20: run() }, (target) =>
      copyFileSync(source, path.join(target, 'snapshot.zip'))
    );

    const downloaded = resolveLocalSnapshot({ snapshotFile: null, temporaryDirectory, github });
    expect(path.dirname(downloaded.file)).toBe(downloaded.downloadDirectory);
    expect(path.dirname(downloaded.downloadDirectory!)).toBe(temporaryDirectory);
    discardDownloadedSnapshot(downloaded);
    expect(readdirSync(temporaryDirectory)).toEqual([]);

    const named = resolveLocalSnapshot({ snapshotFile: source, temporaryDirectory, github: fakeGitHub([], {}) });
    expect(named).toEqual({ file: source, downloadDirectory: null });
    discardDownloadedSnapshot(named);
    expect(existsSync(source)).toBe(true);
  });

  test('refuses a download that is not the snapshot alone, a named file that fails the check, and a missing artifact, leaving nothing behind', () => {
    const temporaryDirectory = directory('launch-');
    const raw = rawExport();
    const loadable = snapshot(1);
    const withoutFactions = snapshot(0);
    const refused: Array<[(target: string) => void, string]> = [
      [(target) => copyFileSync(raw, path.join(target, 'snapshot.zip')), 'The snapshot was refused'],
      [
        (target) => copyFileSync(withoutFactions, path.join(target, 'snapshot.zip')),
        'tables that must hold rows, which the file leaves empty',
      ],
      [
        (target) => {
          copyFileSync(loadable, path.join(target, 'snapshot.zip'));
          writeFileSync(path.join(target, 'extra.jsonl'), '');
        },
        'does not hold snapshot.zip alone',
      ],
    ];
    for (const [download, reason] of refused) {
      const github = fakeGitHub(newest, { 20: run() }, download);
      expect(() => resolveLocalSnapshot({ snapshotFile: null, temporaryDirectory, github })).toThrow(reason);
      expect(readdirSync(temporaryDirectory)).toEqual([]);
    }
    expect(() =>
      resolveLocalSnapshot({ snapshotFile: withoutFactions, temporaryDirectory, github: fakeGitHub([], {}) })
    ).toThrow('tables that must hold rows, which the file leaves empty');

    expect(() => resolveLocalSnapshot({ snapshotFile: null, temporaryDirectory, github: fakeGitHub([], {}) })).toThrow(
      '--data=fixture'
    );
    expect(readdirSync(temporaryDirectory)).toEqual([]);
  });
});
