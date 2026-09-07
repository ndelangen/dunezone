import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const run = promisify(execFile);
const script = join(import.meta.dirname, 'assert-e2e-shards-cover.mjs');
/* A cold node spawn on a loaded runner is the shape that timed out the oxlint gate test (#1048); the budgets follow that file. */
const SPAWN_BUDGET_MS = 20_000;
const TEST_BUDGET_MS = 30_000;

type Verdict = { code: number; stderr: string };

/** Runs the gate against a fixture repository: the spec files named, with the given lists. */
async function gate(specs: string[], shards: Record<string, string[]>): Promise<Verdict> {
  const root = mkdtempSync(join(tmpdir(), 'e2e-shards-'));
  try {
    mkdirSync(join(root, 'e2e'));
    for (const spec of specs) {
      writeFileSync(join(root, 'e2e', spec), '');
    }
    writeFileSync(join(root, 'e2e', 'shards.json'), JSON.stringify(shards));
    try {
      await run(process.execPath, [script, root], { timeout: SPAWN_BUDGET_MS });
      return { code: 0, stderr: '' };
    } catch (error) {
      const failure = error as { code?: number; stderr?: string; killed?: boolean };
      if (failure.killed) {
        throw new Error(`the gate did not finish within ${SPAWN_BUDGET_MS}ms`, { cause: error });
      }
      return { code: failure.code ?? 1, stderr: failure.stderr ?? '' };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const animation = 'page-header-transition.spec.ts';

describe('assert-e2e-shards-cover', { timeout: TEST_BUDGET_MS }, () => {
  test('passes when every spec except the animation spec is listed exactly once', async () => {
    const verdict = await gate([animation, 'a.spec.ts', 'b.spec.ts', 'c.spec.ts'], {
      '1': ['e2e/a.spec.ts'],
      '2': ['e2e/b.spec.ts', 'e2e/c.spec.ts'],
    });
    expect(verdict.code).toBe(0);
  });

  test('fails on a spec no shard lists, naming it', async () => {
    const verdict = await gate([animation, 'a.spec.ts', 'b.spec.ts'], { '1': ['e2e/a.spec.ts'] });
    expect(verdict.code).toBe(1);
    expect(verdict.stderr).toContain('e2e/b.spec.ts is assigned to no shard');
  });

  test('fails on a spec two shards list', async () => {
    const verdict = await gate([animation, 'a.spec.ts'], { '1': ['e2e/a.spec.ts'], '2': ['e2e/a.spec.ts'] });
    expect(verdict.code).toBe(1);
    expect(verdict.stderr).toContain('e2e/a.spec.ts is assigned to shards 1 and 2');
  });

  test('fails on a listed file that does not exist, and on the animation spec being listed', async () => {
    const verdict = await gate([animation, 'a.spec.ts'], {
      '1': ['e2e/a.spec.ts', 'e2e/gone.spec.ts'],
      '2': [`e2e/${animation}`],
    });
    expect(verdict.code).toBe(1);
    expect(verdict.stderr).toContain('e2e/gone.spec.ts, which does not exist');
    expect(verdict.stderr).toContain('must not be listed');
  });

  test('fails on a list entry that is not a spec file directly under e2e', async () => {
    const verdict = await gate([animation, 'a.spec.ts'], { '1': ['e2e/a.spec.ts', '../package.json'] });
    expect(verdict.code).toBe(1);
    expect(verdict.stderr).toContain('../package.json, which is not a spec file directly under e2e');
  });

  test('refuses a root outside the repository and the temporary directory', async () => {
    try {
      await run(process.execPath, [script, '/'], { timeout: SPAWN_BUDGET_MS });
      throw new Error('the gate accepted / as a root');
    } catch (error) {
      const failure = error as { code?: number; stderr?: string };
      expect(failure.code).toBe(2);
      expect(failure.stderr).toContain('The root must be the repository or a directory under');
    }
  });

  test('fails on shard keys that are not 1 through N', async () => {
    const verdict = await gate([animation, 'a.spec.ts'], { '1': [], '3': ['e2e/a.spec.ts'] });
    expect(verdict.code).toBe(1);
    expect(verdict.stderr).toContain('shard keys must be');
  });

  test('passes against the repository itself', async () => {
    const { stderr } = await run(process.execPath, [script], { timeout: SPAWN_BUDGET_MS });
    expect(stderr).toBe('');
  });
});
