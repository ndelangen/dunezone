import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { GitHub, Reading } from './deploy-decision';
import { decide, position } from './deploy-decision';

const GAME = 'https://dune.zone/__play/health';
const PUBLISHER = 'https://dune.zone/__asset-publisher/health';
const EARLIER = 'e'.repeat(40);
const LATER = 'f'.repeat(40);
const THIS = 'a'.repeat(40);

/** The two runs GitHub started for #1618's merge on 2026-10-01, the second one asking. */
const FIRST_RUN = 36_923_609_357;
const THIS_RUN = 36_923_879_225;

const released: Reading[] = [
  { endpoint: GAME, sha: THIS, position: 'same' },
  { endpoint: PUBLISHER, sha: THIS, position: 'same' },
];

type Run = { id: number; head_sha: string; status: string; conclusion: string | null };

/** This run, as the Actions API lists it while its gate job runs. */
const asking: Run = { id: THIS_RUN, head_sha: THIS, status: 'in_progress', conclusion: null };

function github(request: GitHub['request']): GitHub {
  return {
    api: 'https://api.github.com',
    repository: 'ndelangen/dunezone',
    token: '',
    head: THIS,
    run: THIS_RUN,
    request,
  };
}

/** Answers the runs list for this workflow and commit the way GitHub does, with this run in it. */
function listing(...others: Run[]): GitHub {
  const runs = [asking, ...others];
  return github(async () => Response.json({ total_count: runs.length, workflow_runs: runs }));
}

const unreachable = github(async () => {
  throw new TypeError('fetch failed');
});

describe('production deploy decision', () => {
  test('deploys over an earlier release and hands its commit to the dev rebuild', async () => {
    const readings: Reading[] = [
      { endpoint: GAME, sha: EARLIER, position: 'older' },
      { endpoint: PUBLISHER, sha: EARLIER, position: 'older' },
    ];
    expect(await decide(readings, 1, listing())).toMatchObject({ deploy: true, base: EARLIER });
  });

  test('stops on every attempt when a Worker is on a later commit, whatever the Actions API says', async () => {
    const late: Reading[] = [
      { endpoint: GAME, sha: LATER, position: 'newer' },
      { endpoint: PUBLISHER, position: 'unknown', note: 'no answer' },
    ];
    expect(await decide(late, 1, unreachable)).toEqual({
      deploy: false,
      base: '',
      reason: `${GAME} already reports ${LATER}, a later commit`,
    });
    const partlyLate: Reading[] = [
      { endpoint: GAME, sha: LATER, position: 'newer' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect((await decide(partlyLate, 1, listing())).deploy).toBe(false);
    expect((await decide(partlyLate, 2, unreachable)).deploy).toBe(false);
  });

  test('a rerun deploys a commit every Worker already has', async () => {
    const finished = listing({ id: FIRST_RUN, head_sha: THIS, status: 'completed', conclusion: 'success' });
    expect(await decide(released, 2, finished)).toMatchObject({ deploy: true, base: '' });
  });

  test('deploys, with no base, when production cannot be read or only part of it has this commit', async () => {
    const unreadable: Reading[] = [
      { endpoint: GAME, position: 'unknown', note: 'HTTP 503' },
      { endpoint: PUBLISHER, sha: THIS, position: 'same' },
    ];
    expect(await decide(unreadable, 1, listing())).toMatchObject({ deploy: true, base: '' });
    const halfReleased: Reading[] = [
      { endpoint: GAME, sha: THIS, position: 'same' },
      { endpoint: PUBLISHER, sha: EARLIER, position: 'older' },
    ];
    expect(await decide(halfReleased, 1, listing())).toMatchObject({ deploy: true, base: '' });
  });
});

/*
 * A second push event for one merge starts a second run, which reaches the gate after the first run has finished, since the deploy-production group runs one at a time.
 * On 2026-10-01 the first run failed at the Storybook deploy after both Workers went out, and the second stopped at the gate, leaving the release unfinished.
 */
describe('a first attempt for a commit every Worker already reports', () => {
  test('stops when an earlier run of this workflow finished green on it', async () => {
    const finished = listing({ id: FIRST_RUN, head_sha: THIS, status: 'completed', conclusion: 'success' });
    expect(await decide(released, 1, finished)).toMatchObject({ deploy: false, base: '' });
  });

  test('deploys when the earlier run failed, which finishes that release', async () => {
    const failed = listing({ id: FIRST_RUN, head_sha: THIS, status: 'completed', conclusion: 'failure' });
    expect(await decide(released, 1, failed)).toMatchObject({ deploy: true, base: '' });
  });

  test('deploys when no earlier run exists for this commit, even beside a green run for another one', async () => {
    expect(await decide(released, 1, listing())).toMatchObject({ deploy: true, base: '' });
    const otherCommit = listing({ id: FIRST_RUN, head_sha: EARLIER, status: 'completed', conclusion: 'success' });
    expect(await decide(released, 1, otherCommit)).toMatchObject({ deploy: true, base: '' });
  });

  test('counts neither a run still queued or in progress nor this run, whatever the list says about it', async () => {
    const waiting = listing(
      { id: FIRST_RUN, head_sha: THIS, status: 'queued', conclusion: null },
      { id: FIRST_RUN + 1, head_sha: THIS, status: 'in_progress', conclusion: null }
    );
    expect(await decide(released, 1, waiting)).toMatchObject({ deploy: true, base: '' });
    const itself = github(async () =>
      Response.json({
        total_count: 1,
        workflow_runs: [{ ...asking, status: 'completed', conclusion: 'success' }],
      })
    );
    expect(await decide(released, 1, itself)).toMatchObject({ deploy: true, base: '' });
  });

  test('deploys when the Actions API cannot be read', async () => {
    expect(await decide(released, 1, unreachable)).toMatchObject({ deploy: true, base: '' });
    const forbidden = github(async () => new Response('{"message":"Resource not accessible"}', { status: 403 }));
    expect(await decide(released, 1, forbidden)).toMatchObject({ deploy: true, base: '' });
    const notAList = github(async () => Response.json({ message: 'Not Found' }));
    expect(await decide(released, 1, notAList)).toMatchObject({ deploy: true, base: '' });
  });
});

/*
 * A throwaway repository holding one commit and its child, so git itself answers which one comes first.
 * Swapping the two ancestry checks in position turns newer into older and back, and fails this test.
 */
describe('where production sits in git history', () => {
  let repository = '';
  let parent = '';
  let child = '';

  beforeAll(() => {
    repository = mkdtempSync(join(tmpdir(), 'deploy-decision-'));
    const git = (args: string[]) =>
      execFileSync('/usr/bin/git', ['-c', 'commit.gpgSign=false', ...args], {
        cwd: repository,
        // mktree reads its entries from stdin, and an empty list is the empty tree.
        input: '',
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: 'Deploy decision test',
          GIT_AUTHOR_EMAIL: 'deploy-decision@example.invalid',
          GIT_COMMITTER_NAME: 'Deploy decision test',
          GIT_COMMITTER_EMAIL: 'deploy-decision@example.invalid',
        },
      }).trim();
    git(['init', '--quiet']);
    const tree = git(['mktree']);
    parent = git(['commit-tree', tree, '-m', 'parent']);
    child = git(['commit-tree', tree, '-p', parent, '-m', 'child']);
  });

  afterAll(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  test('reads a child as newer and a parent as older than the commit a run deploys', () => {
    expect(position(child, child, repository)).toBe('same');
    expect(position(parent, child, repository)).toBe('newer');
    expect(position(child, parent, repository)).toBe('older');
  });

  test('leaves a commit git does not have unknown', () => {
    expect(position(child, '1'.repeat(40), repository)).toBe('unknown');
  });

  test('leaves a short or option-shaped value unknown, even a prefix git could resolve', () => {
    expect(position(child, parent.slice(0, 12), repository)).toBe('unknown');
    expect(position(child, '--all', repository)).toBe('unknown');
  });
});

/*
 * The gate's answer reaches the deploy job through the script's GITHUB_OUTPUT line, the decision step, the job's outputs and an if: condition.
 * A key renamed at any link reads as empty, and an empty answer has to deploy, so every condition on it skips only on 'false'.
 */
describe('the release gate in the production deploy workflow', () => {
  test('reads the keys the script writes, and skips the deploy only on an explicit false', () => {
    const script = readFileSync('scripts/deploy-decision.ts', 'utf8');
    const workflow = readFileSync('.github/workflows/deploy-main.yml', 'utf8');
    const written = new Map(
      [...script.matchAll(/(?:`|\\n)(\w+)=\$\{decision\.(\w+)\}/g)].map(([, key, field]) => [field, key])
    );
    const step = /id: (\w+)\n +run: bun run \.\/scripts\/deploy-decision\.ts\n/.exec(workflow)?.[1];
    const jobOutput = (field: string) =>
      new RegExp(`\\n +(\\w+): \\$\\{\\{ steps\\.${step}\\.outputs\\.${written.get(field)} \\}\\}\\n`).exec(
        workflow
      )?.[1];
    const deploy = jobOutput('deploy');
    const base = jobOutput('base');
    expect(deploy).toBeDefined();
    expect(base).toBeDefined();
    const failOpen = `needs.release_gate.outputs.${deploy} != 'false'`;
    const deployJob = workflow.slice(workflow.indexOf('\n  deploy:\n'), workflow.indexOf('\n  dev_rebuild:\n'));
    expect(deployJob).toContain(`\n    if: ${failOpen}\n`);
    const conditions = [...workflow.matchAll(new RegExp(`needs\\.release_gate\\.outputs\\.${deploy}\\b.*`, 'g'))];
    expect([...new Set(conditions.map(([condition]) => condition))]).toEqual([failOpen]);
    expect(workflow).toContain(`base: \${{ needs.release_gate.outputs.${base} || github.event.before }}`);
  });
});
