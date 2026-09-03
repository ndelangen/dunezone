import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const run = promisify(execFile);

/**
 * The gate is run for real rather than its internals imported, because half of what these defend is the process contract: a check that exits zero on a violation reads as coverage without being any.
 * Fixture trees are built under a temp directory and removed in a finally, each test its own root.
 */
async function gate(files: Record<string, string>): Promise<{ code: number; output: string }> {
  const root = mkdtempSync(join(tmpdir(), 'css-var-fixture-'));
  try {
    for (const [path, content] of Object.entries(files)) {
      const full = join(root, path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, content);
    }
    try {
      const { stdout } = await run('node', ['scripts/assert-css-custom-properties-defined.mjs'], {
        env: {
          ...process.env,
          CSS_VAR_DEFINITIONS_ROOT: join(root, 'src'),
          CSS_VAR_READS_ROOT: join(root, 'src', 'app'),
        },
      });
      return { code: 0, output: stdout };
    } catch (error) {
      /* execFile's code can be a string like ENOENT; anything non-numeric is a failure, not an exit. */
      const failure = error as { code?: number | string; stdout?: string; stderr?: string };
      const code = typeof failure.code === 'number' ? failure.code : 1;
      return { code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('assert-css-custom-properties-defined', () => {
  test('an undefined read fails and names the property and its file', async () => {
    const result = await gate({
      'src/app/a.module.css': '.x { color: var(--color-ghost); }',
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('--color-ghost');
    expect(result.output).toContain('a.module.css');
  });

  test('a defined read passes, wherever under src the definition lives', async () => {
    const result = await gate({
      'src/game/tokens.css': ':root { --sheet-aspect: 100%; }',
      'src/app/a.module.css': '.x { padding-top: var(--sheet-aspect); }',
    });
    expect(result.code).toBe(0);
  });

  test('an allowlisted runtime-written property passes', async () => {
    const result = await gate({
      'src/app/a.module.css': '.x { width: var(--canvas-width); top: var(--mantine-spacing-md); }',
    });
    expect(result.code).toBe(0);
  });

  test('a commented-out definition satisfies nothing', async () => {
    const result = await gate({
      'src/app/a.module.css': '/* --color-ghost: red; */ .x { color: var(--color-ghost); }',
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('--color-ghost');
  });

  test('a read in TypeScript is policed like one in CSS', async () => {
    const result = await gate({
      'src/app/a.ts': "export const tint = 'var(--color-phantom)';",
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('--color-phantom');
  });
});
