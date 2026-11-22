import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vite-plus/test';

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
    retryDelayMs: 0,
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
 * GitHub's compare API, answering for a parent and its child the way it does: head is ahead of base when base is in its history, behind when it is the other way round, and 404 for a commit it does not have.
 * Swapping the two answers in position turns newer into older and back, and fails this test.
 */
const PARENT = 'b'.repeat(40);
const CHILD = 'c'.repeat(40);
const requested: string[] = [];
const history = github(async (url) => {
  requested.push(url);
  const [, base, head] = /\/compare\/(\w+)\.\.\.(\w+)\?/.exec(url) ?? [];
  const known = [PARENT, CHILD];
  if (url.includes('/actions/workflows/')) {
    return Response.json({ total_count: 1, workflow_runs: [asking] });
  }
  if (!known.includes(base!) || !known.includes(head!)) {
    return Response.json({ message: 'Not Found' }, { status: 404 });
  }
  const status = base === head ? 'identical' : base === PARENT ? 'ahead' : 'behind';
  return Response.json({ status, ahead_by: 0, behind_by: 0, commits: [] });
});

describe('where production sits in git history', () => {
  test('reads a child as newer and a parent as older than the commit a run deploys', async () => {
    expect(await position(CHILD, CHILD, history)).toBe('same');
    expect(await position(PARENT, CHILD, history)).toBe('newer');
    expect(await position(CHILD, PARENT, history)).toBe('older');
  });

  test('hands the dev rebuild the older commit when a failed run left the Workers on two earlier ones', async () => {
    const split: Reading[] = [
      { endpoint: GAME, sha: CHILD, position: 'older' },
      { endpoint: PUBLISHER, sha: PARENT, position: 'older' },
    ];
    expect(await decide(split, 1, history)).toMatchObject({ deploy: true, base: PARENT });
    const unplaced: Reading[] = [split[0], { endpoint: PUBLISHER, sha: '1'.repeat(40), position: 'older' }];
    expect(await decide(unplaced, 1, history)).toMatchObject({ deploy: true, base: '' });
  });

  test('leaves a commit GitHub does not have, or one on another branch, unknown', async () => {
    expect(await position(CHILD, '1'.repeat(40), history)).toBe('unknown');
    const diverged = github(async () => Response.json({ status: 'diverged' }));
    expect(await position(CHILD, PARENT, diverged)).toBe('unknown');
  });

  test('asks again after a failed answer, and fails the gate rather than guess when GitHub never answers', async () => {
    let calls = 0;
    const flaky = github(async () => {
      calls += 1;
      return calls < 3 ? new Response('', { status: 502 }) : Response.json({ status: 'ahead' });
    });
    expect(await position(CHILD, PARENT, flaky)).toBe('older');
    expect(calls).toBe(3);
    await expect(position(CHILD, PARENT, unreachable)).rejects.toThrow('could not place');
    let brokenCalls = 0;
    const broken = github(async () => {
      brokenCalls += 1;
      return new Response('', { status: 503 });
    });
    await expect(position(CHILD, PARENT, broken)).rejects.toThrow('HTTP 503');
    expect(brokenCalls).toBe(3);
  });

  test('never puts a short or path-shaped value in the URL, even a prefix GitHub could resolve', async () => {
    requested.length = 0;
    expect(await position(CHILD, PARENT.slice(0, 12), history)).toBe('unknown');
    expect(await position(CHILD, '../../actions', history)).toBe('unknown');
    expect(requested).toEqual([]);
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
    const deployStart = workflow.indexOf('\n  deploy:\n');
    const nextJob = /\n {2}\w+:\n/g;
    nextJob.lastIndex = deployStart + 1;
    const deployJob = workflow.slice(deployStart, nextJob.exec(workflow)?.index);
    expect(deployJob).toContain(`\n    if: ${failOpen}\n`);
    const conditions = [...workflow.matchAll(new RegExp(`needs\\.release_gate\\.outputs\\.${deploy}\\b.*`, 'g'))];
    expect([...new Set(conditions.map(([condition]) => condition))]).toEqual([failOpen]);
  });
});
