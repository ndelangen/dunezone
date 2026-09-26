import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const run = promisify(execFile);

/*
 * The binary itself rather than `npx oxlint`: npx loads npm's own CLI before it finds the local
 * bin, which is the largest part of a cold spawn, and it is one missing bin away from a registry call.
 */
const OXLINT = join(import.meta.dirname, '..', 'node_modules', '.bin', 'oxlint');

/*
 * Measured on CI: a warm oxlint run costs 0.3 to 0.85 s, and the first run in a fresh job, which
 * pays the cold binary and the plugin host, costs 2.2 to 4.0 s on a green day. It was killed at the
 * 5 s default five times between 2026-08-31 and 2026-09-04 on branches that did not touch this file.
 * The spawn's budget expires before the test's, so a hung oxlint is reported as oxlint and not as a
 * bare test timeout (#1048).
 */
const SPAWN_BUDGET_MS = 20_000;
const TEST_BUDGET_MS = 30_000;

/** `execFile` marks the error of a child it had to kill; a lint result never carries that mark. */
function wasKilled(error: unknown): error is { killed: true } {
  return typeof error === 'object' && error !== null && (error as { killed?: unknown }).killed === true;
}

/** A failed `execFile` carries what the process printed; anything else thrown here is not a lint result. */
function hasStdout(error: unknown): error is { stdout: string } {
  return typeof error === 'object' && error !== null && typeof (error as { stdout?: unknown }).stdout === 'string';
}

/**
 * The gate is run for real rather than the rule called directly, because half of what these tests defend is the config wiring rather than the rule body: `no-ai-tells-in-story-descriptions` reaches a file only through an override scoped to `**\/*.stories.tsx`.
 * Replacement in an oxlint override is per rule rather than wholesale: an override that restates a rule replaces that rule's configuration, and rules it does not mention survive.
 * The fourth test is what establishes that here, and it is why the claim is worth a probe rather than a sentence: an earlier version of this comment asserted the wholesale model, which that same test disproves.
 * A unit test on the rule would stay green through an override that had switched it off entirely.
 *
 * Fixtures are written under a temporary directory inside the repository, then removed, so no file carrying a deliberate tell is ever committed where another checker could read it as a real one.
 */
const FIXTURE_ROOT = 'src/__lint-fixtures__';
/* An existing folder of Play client code, so a probe there is scoped like the files the wall-clock ban guards and leaves no folder behind. */
const PLAY_FIXTURE_ROOT = 'src/app/routes/_app/play/multiplayer';

async function lintDiagnostics(fileName: string, source: string, root = FIXTURE_ROOT): Promise<string> {
  /* The root is created here rather than committed: an empty directory does not survive a clone. */
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'probe-'));
  const file = join(directory, fileName);
  try {
    writeFileSync(file, source);
    const { stdout } = await run(OXLINT, [file], { cwd: process.cwd(), timeout: SPAWN_BUDGET_MS });
    return stdout;
  } catch (error) {
    if (wasKilled(error)) {
      throw new Error(`oxlint did not finish within ${SPAWN_BUDGET_MS}ms`, { cause: error });
    }
    /* oxlint exits non-zero when it reports, and its findings are on stdout rather than stderr. */
    return hasStdout(error) ? error.stdout : '';
  } finally {
    /*
     * Only this call's own directory is removed. Tearing down the shared root instead would make the
     * file serial-only, since a parallel case could lose its fixture to a neighbour's teardown.
     */
    rmSync(directory, { recursive: true, force: true });
  }
}

const description = (prose: string) => `
export default {
  parameters: { docs: { description: { component: ${JSON.stringify(prose)} } } },
};
`;

const productCopy = (prose: string) => `
export const options = [{ value: 'faction-1', label: ${JSON.stringify(prose)} }];
`;

/* Storybook's per-story nesting, the sibling of `description.component`. */
const storyDescription = (prose: string) => `
export const One = { parameters: { docs: { description: { story: ${JSON.stringify(prose)} } } } };
`;

/* A component's own `description` prop, under test. The key matches; the branch does not. */
const descriptionArg = (prose: string) => `
export const WithDescription = { args: { description: ${JSON.stringify(prose)} } };
`;

/* The controls table's words for a prop, which are documentation even though they sit outside \`docs\`. */
const argTypeDescription = (prose: string) => `
export default { argTypes: { children: { description: ${JSON.stringify(prose)} } } };
`;

describe('no-ai-tells-in-story-descriptions', { timeout: TEST_BUDGET_MS }, () => {
  test('reports a tell in a story description', async () => {
    const output = await lintDiagnostics(
      'probe.stories.tsx',
      description('The band above every page — not a surface.')
    );
    expect(output).toContain('no-ai-tells-in-story-descriptions');
    expect(output).toContain('Em dash in a story description');
  });

  test('leaves the product its own words in the same file', async () => {
    const output = await lintDiagnostics('probe.stories.tsx', productCopy('House Atreides — unassigned'));
    expect(output).not.toContain('no-ai-tells-in-story-descriptions');
  });

  test('reports a tell in the per-story description, not only the component one', async () => {
    const output = await lintDiagnostics(
      'probe.stories.tsx',
      storyDescription('Below the threshold — the rail collapses.')
    );
    expect(output).toContain('Em dash in a story description');
  });

  /* Every tell the shared definition knows, not the em dash alone. */
  test('reports a curly quote in a description', async () => {
    const output = await lintDiagnostics('probe.stories.tsx', description('Uses Storybook’s mobile viewport.'));
    expect(output).toContain('Curly quote in a story description');
  });

  /* `args` hold the component's real props, so a `description` there is the product's copy under test. */
  test('leaves a description that is a component arg alone', async () => {
    const output = await lintDiagnostics(
      'probe.stories.tsx',
      descriptionArg('Every faction published against this ruleset — all of them.')
    );
    expect(output).not.toContain('no-ai-tells-in-story-descriptions');
  });

  test('reports a tell in an argTypes description, which is documentation too', async () => {
    const output = await lintDiagnostics(
      'probe.stories.tsx',
      argTypeDescription('The mounted route — as the props it supplies.')
    );
    expect(output).toContain('Em dash in a story description');
  });

  /* The scoping half: the identical prose in a file that is not a story is product copy, and stays legal. */
  test('leaves a description alone outside a stories file', async () => {
    const output = await lintDiagnostics('probe.tsx', description('The band above every page — not a surface.'));
    expect(output).not.toContain('no-ai-tells-in-story-descriptions');
  });

  /**
   * The override that enables the rule must not replace the rule set a stories file already had.
   * Without this, a future override could switch the inherited rules off for every story in the repo and every one of the tests above would stay green.
   */
  test('keeps the inherited rules biting inside a stories file', async () => {
    const output = await lintDiagnostics(
      'probe.stories.tsx',
      'export function probe(x: number) {\n  if (x) return 1;\n  return 0;\n}\n'
    );
    expect(output).toContain('curly');
  });
});

describe('no-wall-clock', { timeout: TEST_BUDGET_MS }, () => {
  const wallClock = `
import { useState } from 'react';
export function useProbe() {
  const [now] = useState(Date.now);
  return [now, Date.now(), new Date(), Date()];
}
`;
  const reports = (output: string) => output.split('local(no-wall-clock)').length - 1;

  test('reports every wall-clock read in Play client code', async () => {
    expect(reports(await lintDiagnostics('probe.ts', wallClock, PLAY_FIXTURE_ROOT))).toBe(4);
  });

  test('leaves the monotonic clock and a Date built from a value alone', async () => {
    const output = await lintDiagnostics(
      'probe.ts',
      'export const probe = (savedAt: number) => [performance.now(), new Date(savedAt), Date.parse("2026-01-01")];\n',
      PLAY_FIXTURE_ROOT
    );
    expect(reports(output)).toBe(0);
  });

  /* The scoping half: Play tests and stories date their fixtures, and code outside Play is not the player's table. */
  test('leaves Play tests, Play stories and code outside Play alone', async () => {
    expect(reports(await lintDiagnostics('probe.test.ts', wallClock, PLAY_FIXTURE_ROOT))).toBe(0);
    expect(reports(await lintDiagnostics('probe.stories.tsx', wallClock, PLAY_FIXTURE_ROOT))).toBe(0);
    expect(reports(await lintDiagnostics('probe.ts', wallClock))).toBe(0);
  });

  /**
   * The override that enables the ban must not drop the bans every file under src already carries.
   * Each inherited ban is tripped once in the same Play file, because a dropped ban fails silently.
   */
  test('keeps the inherited bans biting in Play client code', async () => {
    const output = await lintDiagnostics(
      'probe.ts',
      "import 'convex/server';\nimport Markdown from 'markdown-to-jsx';\nexport function probe(x: number) {\n  if (x) return Markdown;\n  return null;\n}\n",
      PLAY_FIXTURE_ROOT
    );
    expect(output).toContain('Only `src/app/db` may import Convex.');
    expect(output).toContain('Formatted text is the only rich text.');
    expect(output).toContain('curly');
  });
});
