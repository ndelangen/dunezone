import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { data, Evaluator, Lexer, Parser } from '@actions/expressions';
import { describe, expect, test } from 'vite-plus/test';
import { parse } from 'yaml';

/* Operational workflow contract under ADR-0002: run the real action and evaluate the scheduler's expressions. */
interface Step {
  id?: string;
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  'continue-on-error'?: boolean;
}

interface Job {
  if: string;
  needs?: string | string[];
  'runs-on': string;
  'continue-on-error'?: boolean;
  outputs?: Record<string, string>;
  steps: Step[];
}

const root = resolve(import.meta.dirname, '..');
const workflow = parse(readFileSync(join(root, '.github/workflows/reusable-verify.yml'), 'utf8')) as {
  jobs: Record<string, Job>;
};
const decisionJob = workflow.jobs.hosted_play_webgpu_decision!;
const webgpuJob = workflow.jobs.hosted_play_webgpu!;
const validation = decisionJob.steps.find((step) => step.env?.RUN_WEBGPU)!;

/** Evaluate the checked-in workflow expressions with GitHub's expression engine. */
function render(template: string, values: Record<string, unknown>): string {
  return template.replace(/\$\{\{([\s\S]*?)\}\}/gu, (_, expression: string) => {
    const ast = new Parser(new Lexer(expression).lex().tokens, Object.keys(values), []).parse();
    const dictionary = JSON.parse(JSON.stringify(values), data.reviver) as data.Dictionary;
    return new Evaluator(ast, dictionary).evaluate().coerceString();
  });
}

function validate(run: string) {
  const values = { steps: { closure: { outputs: { run } } } };
  return spawnSync('bash', ['-eo', 'pipefail', '-c', validation.run!], {
    env: { ...process.env, RUN_WEBGPU: render(validation.env!.RUN_WEBGPU!, values) },
    encoding: 'utf8',
  });
}

function requestsMac(run: string, result = 'success', draft = false) {
  const output = render(decisionJob.outputs!.run!, { steps: { closure: { outputs: { run } } } });
  return (
    render(webgpuJob.if, {
      inputs: { draft },
      needs: { hosted_play_webgpu_decision: { result, outputs: { run: output } } },
    }) === 'true'
  );
}

/** Run the action without dependencies installed, replacing only GitHub's API responses. */
function decide(event: string, responses: Record<string, unknown> = {}, force = '', brokenScript = false) {
  const directory = mkdtempSync(join(tmpdir(), 'play-scheduling-'));
  try {
    const workspace = join(directory, 'workspace');
    for (const file of [
      'scripts/hosted-play-closure.ts',
      'scripts/lib/hosted-play-closure.ts',
      'scripts/lib/storybook-shards.ts',
    ]) {
      const destination = join(workspace, file);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(join(root, file), destination);
    }
    writeFileSync(
      join(directory, 'gh'),
      `#!/usr/bin/env node
const responses = JSON.parse(process.env.GH_RESPONSES);
const response = responses[process.argv.at(-1)];
if (response === undefined) process.exit(1);
process.stdout.write(JSON.stringify(response));
`,
      { mode: 0o755 }
    );
    const output = join(directory, 'output');
    writeFileSync(output, '');
    const outcome = spawnSync('bash', [join(root, '.github/actions/play-closure/decide.sh')], {
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        GH_RESPONSES: JSON.stringify(responses),
        GITHUB_WORKSPACE: brokenScript ? join(directory, 'missing') : workspace,
        RUNNER_TEMP: directory,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(directory, 'summary.md'),
        EVENT: event,
        REPO: 'owner/repo',
        BASE: 'base',
        HEAD: 'head',
        SHA: 'tip',
        FORCE: force,
        WORKFLOW_REF: 'owner/repo/.github/workflows/hosted-play-daily.yml@refs/heads/main',
      },
      encoding: 'utf8',
    });
    return { status: outcome.status, run: /^run=(.*)$/mu.exec(readFileSync(output, 'utf8'))?.[1] ?? '' };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const comparison = 'repos/owner/repo/compare/base...head';
const dailyRuns = 'repos/owner/repo/actions/workflows/hosted-play-daily.yml/runs?branch=main&status=success&per_page=1';
const files = (filename: string) => ({ files: [{ filename }], merge_base_commit: { sha: 'base' } });

describe('WebGPU scheduling', () => {
  test.each([
    ['.github/workflows/reusable-verify.yml', 'true'],
    ['src/app/routes/_app/tutorial/Welcome.tsx', 'false'],
    ['docs/deployment.md', 'false'],
  ])('a change to %s decides run=%s before allocating macOS', (filename, expected) => {
    const decision = decide('pull_request', { [comparison]: files(filename) });
    expect(decision).toEqual({ status: 0, run: expected });
    expect(validate(decision.run).status).toBe(0);
    expect(requestsMac(decision.run)).toBe(expected === 'true');
  });

  test.each([
    ['an unavailable comparison', {}],
    ['an unreadable comparison', { [comparison]: {} }],
    ['an empty comparison', { [comparison]: { files: [] } }],
    ['a truncated comparison', { [comparison]: { files: Array.from({ length: 300 }, () => ({ filename: 'a.md' })) } }],
    [
      'a rename out of the closure',
      { [comparison]: { files: [{ filename: 'other.ts', previous_filename: 'workers/game/index.ts' }] } },
    ],
  ])('%s still requests WebGPU', (_, responses) => {
    const decision = decide('pull_request', responses);
    expect(decision).toEqual({ status: 0, run: 'true' });
    expect(requestsMac(decision.run)).toBe(true);
  });

  test('a failed classifier fails the decision instead of skipping verification', () => {
    const decision = decide('pull_request', { [comparison]: files('docs/deployment.md') }, '', true);
    expect(decision.status).not.toBe(0);
    expect(decision.run).toBe('');
    expect(requestsMac(decision.run, 'failure')).toBe(false);
    expect(decisionJob['continue-on-error']).not.toBe(true);
    expect(decisionJob.steps.every((step) => step['continue-on-error'] !== true)).toBe(true);
  });

  test.each(['', 'unknown', 'TRUE', 'false\ntrue'])('a missing or invalid decision %j fails verification', (run) => {
    expect(validate(run).status).toBe(1);
    expect(validate(run).stdout).toContain('::error::');
  });

  test.each(['failure', 'cancelled', 'skipped'])(
    'a %s decision cannot allocate a Mac even with a true output',
    (result) => {
      expect(requestsMac('true', result)).toBe(false);
    }
  );

  test('Linux shards stay independent and drafts allocate neither the decision nor a Mac', () => {
    expect(workflow.jobs.hosted_play!.needs).toBeUndefined();
    expect(decisionJob.needs).toBeUndefined();
    expect(decisionJob['runs-on']).toBe('ubuntu-24.04');
    expect(webgpuJob.needs).toBe('hosted_play_webgpu_decision');
    expect(decisionJob.steps.some((step) => step.uses === './.github/actions/play-closure')).toBe(true);
    expect(webgpuJob.steps.some((step) => step.uses === './.github/actions/play-closure')).toBe(false);
    expect(render(decisionJob.if, { inputs: { draft: false, hosted_only: true } })).toBe('true');
    expect(render(decisionJob.if, { inputs: { draft: true } })).toBe('false');
    expect(requestsMac('true', 'success', true)).toBe(false);
  });
});

describe('daily and forced WebGPU scheduling', () => {
  test('a forced dispatch runs even when the same tree already passed', () => {
    expect(decide('workflow_dispatch', { [dailyRuns]: { workflow_runs: [{ head_sha: 'tip' }] } }, 'true')).toEqual({
      status: 0,
      run: 'true',
    });
  });

  test.each(['schedule', 'workflow_dispatch'])('%s skips a tree the daily workflow already checked', (event) => {
    expect(decide(event, { [dailyRuns]: { workflow_runs: [{ head_sha: 'tip' }] } })).toEqual({
      status: 0,
      run: 'false',
    });
  });

  test.each([
    ['workers/game/index.ts', 'false'],
    ['docs/deployment.md', 'true'],
  ])('a merge changing %s keeps the existing daily decision run=%s', (filename, run) => {
    expect(
      decide('schedule', {
        [dailyRuns]: { workflow_runs: [] },
        'repos/owner/repo/commits/tip': { parents: [{ sha: 'base' }, { sha: 'head' }] },
        [comparison]: { ...files(filename), status: 'ahead' },
      })
    ).toEqual({ status: 0, run });
  });

  test('an unreadable daily history and merge-group events still run', () => {
    expect(decide('schedule')).toEqual({ status: 0, run: 'true' });
    expect(decide('merge_group')).toEqual({ status: 0, run: 'true' });
  });
});
