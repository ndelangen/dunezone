import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { data, Evaluator, Lexer, Parser } from '@actions/expressions';
import { describe, expect, test } from 'vite-plus/test';
import { parse } from 'yaml';

/*
 * Operational workflow contract under ADR-0002, evaluated with GitHub's expression engine.
 * Replay the documented running and pending cancellation rules against the actual workflow configuration.
 * https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency
 */
const workflow = parse(readFileSync('.github/workflows/ci-pr.yml', 'utf8')) as {
  concurrency: { group: string; 'cancel-in-progress': boolean };
  jobs: { verify: { with: { draft: string } }; ci_ok: { name: string; steps: { run?: string }[] } };
};

function context(draft: boolean | null, number = 2428, sha = '19cb3ac87918dab6f12dd94cd730062412cc4dd7') {
  return {
    github: {
      ref: draft === null ? 'refs/heads/gh-readonly-queue/main/proof' : `refs/pull/${number}/merge`,
      sha,
      event_name: draft === null ? 'merge_group' : 'pull_request',
      event: {
        action: draft === null ? 'checks_requested' : draft ? 'synchronize' : 'ready_for_review',
        pull_request: draft === null ? undefined : { number, draft },
      },
    },
  };
}

function render(template: string, values: Record<string, unknown>) {
  return template.replace(/\$\{\{([\s\S]*?)\}\}/gu, (_, expression: string) => {
    const tokens = new Lexer(expression).lex().tokens;
    const ast = new Parser(tokens, Object.keys(values), []).parse();
    const dictionary = JSON.parse(JSON.stringify(values), data.reviver) as data.Dictionary;
    return new Evaluator(ast, dictionary).evaluate().coerceString();
  });
}

function run(draft: boolean | null, number = 2428, sha = '19cb3ac87918dab6f12dd94cd730062412cc4dd7') {
  const values = context(draft, number, sha);
  return {
    group: render(workflow.concurrency.group, values).toLowerCase(),
    draft: render(workflow.jobs.verify.with.draft, values) === 'true',
    check: render(workflow.jobs.ci_ok.name, values),
    state: 'pending' as 'pending' | 'running' | 'cancelled',
  };
}

function admit(runs: ReturnType<typeof run>[], runnerAvailable: boolean) {
  const groups = new Map<string, { running?: ReturnType<typeof run>; pending?: ReturnType<typeof run> }>();
  for (const incoming of runs) {
    const group = groups.get(incoming.group) ?? {};
    if (group.pending) {
      group.pending.state = 'cancelled';
    }
    group.pending = incoming;
    if (group.running && workflow.concurrency['cancel-in-progress']) {
      group.running.state = 'cancelled';
      group.running = undefined;
    }
    if (runnerAvailable && !group.running) {
      incoming.state = 'running';
      group.running = incoming;
      group.pending = undefined;
    }
    groups.set(incoming.group, group);
  }
}

describe('PR CI event ordering', () => {
  for (const runnerAvailable of [true, false]) {
    for (const staleDraftLast of [false, true]) {
      test(`full verification survives ${staleDraftLast ? 'ready then stale draft' : 'draft then ready'} while ${runnerAvailable ? 'running' : 'pending'}`, () => {
        const draft = run(true);
        const full = run(false);
        admit(staleDraftLast ? [full, draft] : [draft, full], runnerAvailable);
        expect(full.state).toBe(runnerAvailable ? 'running' : 'pending');
        expect(full.draft).toBe(false);
        expect(full.check).toBe('ci_ok');
        expect(draft.draft).toBe(true);
        expect(draft.check).toBe('ci_draft');
      });
    }
  }
});

for (const draft of [true, false]) {
  for (const runnerAvailable of [true, false]) {
    test(`a newer ${draft ? 'draft' : 'full'} run replaces older work while ${runnerAvailable ? 'running' : 'pending'}`, () => {
      const older = run(draft);
      const newer = run(draft, 2428, 'b'.repeat(40));
      admit([older, newer], runnerAvailable);
      expect(older.state).toBe('cancelled');
      expect(newer.state).toBe(runnerAvailable ? 'running' : 'pending');
    });
  }
}

test('different PRs do not cancel one another', () => {
  const first = run(false, 2428);
  const second = run(false, 2429);
  admit([first, second], true);
  expect(first.state).toBe('running');
  expect(second.state).toBe('running');
});

test('merge-group events use full verification without a PR payload', () => {
  const merged = run(null);
  const pr = run(false);
  admit([merged, pr], true);
  expect(merged.draft).toBe(false);
  expect(merged.check).toBe('ci_ok');
  expect(merged.state).toBe('running');
  expect(pr.state).toBe('running');
});

for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
  test(`the full merge gate ${result === 'success' ? 'accepts' : 'rejects'} ${result} verification`, () => {
    const step = workflow.jobs.ci_ok.steps.find((step) => step.run);
    if (!step?.run) {
      throw new Error('The merge gate has no executable verification step');
    }
    const command = render(step.run, { needs: { verify: { result } } });
    const outcome = spawnSync('bash', ['-c', command]);
    expect(outcome.status).toBe(result === 'success' ? 0 : 1);
  });
}
