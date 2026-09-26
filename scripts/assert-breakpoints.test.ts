import { execFile } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, test } from 'vitest';

const run = promisify(execFile);

/**
 * The gate runs for real against a copy of today's stylesheets with one change applied, so each case breaks the tree the gate guards rather than a toy tree the lists never name.
 */
async function gate(change: (root: string) => void): Promise<{ code: number; output: string }> {
  const root = mkdtempSync(join(tmpdir(), 'breakpoints-fixture-'));
  try {
    cpSync('src', root, {
      recursive: true,
      filter: (source) => source.endsWith('.css') || statSync(source).isDirectory(),
    });
    change(root);
    try {
      const { stdout } = await run('node', ['scripts/assert-breakpoints.mjs'], {
        env: { ...process.env, BREAKPOINTS_ROOT: root },
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

const block = (prelude: string) => `\n@media ${prelude} {\n  .fixture {\n    color: red;\n  }\n}\n`;

describe('assert-breakpoints', () => {
  test('a width query in a Layout stylesheet fails, even on the ladder', async () => {
    const result = await gate((root) => {
      writeFileSync(join(root, 'app/ui/layout/Fixture.module.css'), block('(max-width: 48rem)'));
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('app/ui/layout/Fixture.module.css:2');
    expect(result.output).toContain('outside the window chrome');
  });

  test.each([
    ['(max-width: 900px)', '900px'],
    ['(min-width: 48em)', '48em'],
    ['(width < 860px)', '860px'],
    ['(30rem <= width < 61.25rem)', '61.25rem'],
    ['(max-width: calc(48rem - 1px))', 'calc(48rem - 1px)'],
    ['((min-width: 30rem) and (max-width: 900px))', '900px'],
    ['screen and (max-device-width: 700px)', '700px'],
  ])('the window chrome fails off the ladder: %s', async (prelude, value) => {
    const result = await gate((root) => {
      appendFileSync(join(root, 'app/shell/AppHeader.module.css'), block(prelude));
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain(`app/shell/AppHeader.module.css`);
    expect(result.output).toContain(`${value} is not on the ladder`);
  });

  test('the window chrome passes on the ladder, in either syntax', async () => {
    const result = await gate((root) => {
      appendFileSync(
        join(root, 'app/routes/_app/play/dune-play.css'),
        block('(30rem <= width < 62rem)') + block('(min-width: 48rem)')
      );
    });
    expect(result.code).toBe(0);
  });

  test('a query that is not about width passes anywhere, and a commented-out one is not read', async () => {
    const result = await gate((root) => {
      writeFileSync(
        join(root, 'app/ui/layout/Fixture.module.css'),
        `${block('(prefers-reduced-motion: reduce)')}/* @media (max-width: 900px) { } */\n`
      );
    });
    expect(result.code).toBe(0);
  });

  test.each([
    ['a new query', (text: string) => text + block('(max-width: 900px)'), '(max-width: 900px)'],
    ['a repeated query', (text: string) => text + block('(max-width: 48em)'), '(max-width: 48em)'],
    ['a changed query', (text: string) => text.replace('(max-width: 48em)', '(max-width: 47em)'), '(max-width: 47em)'],
  ])('a pending file fails on %s', async (_, edit, prelude) => {
    const result = await gate((root) => {
      const path = join(root, 'app/routes/_app/factions/index.module.css');
      writeFileSync(path, edit(readFileSync(path, 'utf8')));
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain(`app/routes/_app/factions/index.module.css`);
    expect(result.output).toContain(`@media ${prelude}: a width query outside the window chrome`);
  });

  test('a pending entry whose file asks no width any more fails', async () => {
    const result = await gate((root) => {
      writeFileSync(join(root, 'app/routes/_app/profiles/$profileSlug/index.module.css'), '.fixture {}\n');
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('app/routes/_app/profiles/$profileSlug/index.module.css: listed as pending');
  });

  test('a pending prelude its file no longer asks fails, while the file keeps its others', async () => {
    const result = await gate((root) => {
      const path = join(root, 'app/ui/list/FactionList.module.css');
      writeFileSync(path, readFileSync(path, 'utf8').replace('(max-width: 62em)', 'print'));
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      'app/ui/list/FactionList.module.css: listed as pending migration at @media (max-width: 62em)'
    );
    expect(result.output).not.toContain('(max-width: 48em)');
  });

  test('a window chrome entry whose file is gone fails', async () => {
    const result = await gate((root) => {
      rmSync(join(root, 'app/shell/SiteNavigation.module.css'));
    });
    expect(result.code).toBe(1);
    expect(result.output).toContain('app/shell/SiteNavigation.module.css: listed as window chrome');
  });
});
