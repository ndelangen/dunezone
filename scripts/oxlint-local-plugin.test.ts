import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const run = promisify(execFile);

/**
 * The gate is run for real rather than the rule called directly, because half of what these tests defend is the config wiring rather than the rule body: `no-ai-tells-in-story-descriptions` only reaches a file through an override scoped to `**\/*.stories.tsx`, and an oxlint override replaces the rule set for the files it matches rather than merging into it.
 * A unit test on the rule would stay green through an override that had switched it off entirely.
 *
 * Fixtures are written under a temporary directory inside the repository, then removed, so no file carrying a deliberate tell is ever committed where another checker could read it as a real one.
 */
const FIXTURE_ROOT = 'src/__lint-fixtures__';

async function lintDiagnostics(fileName: string, source: string): Promise<string> {
  /* The root is created here rather than committed: an empty directory does not survive a clone. */
  mkdirSync(FIXTURE_ROOT, { recursive: true });
  const directory = mkdtempSync(join(FIXTURE_ROOT, 'probe-'));
  const file = join(directory, fileName);
  try {
    writeFileSync(file, source);
    const { stdout } = await run('npx', ['oxlint', file], { cwd: process.cwd() });
    return stdout;
  } catch (error) {
    /* oxlint exits non-zero when it reports, and its findings are on stdout. */
    return String((error as { stdout?: string }).stdout ?? '');
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(FIXTURE_ROOT, { recursive: true, force: true });
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

/* A component's own `description` prop, under test. The key matches; the branch does not. */
const descriptionArg = (prose: string) => `
export const WithDescription = { args: { description: ${JSON.stringify(prose)} } };
`;

/* The controls table's words for a prop, which are documentation even though they sit outside \`docs\`. */
const argTypeDescription = (prose: string) => `
export default { argTypes: { children: { description: ${JSON.stringify(prose)} } } };
`;

describe('no-ai-tells-in-story-descriptions', () => {
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
