import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vite-plus/test';

import { draftSelection, readsFilesByPath, runsEveryUnitTest, testScriptExcludes } from './lib/draft-unit-tests';

describe('draft unit test selection', () => {
  test('a change every job reads runs every file', () => {
    expect(runsEveryUnitTest('bun.lock')).toBe(true);
    expect(runsEveryUnitTest('package.json')).toBe(true);
    expect(runsEveryUnitTest('.github/workflows/reusable-verify.yml')).toBe(true);
    expect(runsEveryUnitTest('.github/actions/setup/action.yml')).toBe(true);
    expect(runsEveryUnitTest('patches/convex-test.patch')).toBe(true);
    expect(runsEveryUnitTest('vite.config.ts')).toBe(true);
  });

  test('a change to application code leaves the choice to the module graph', () => {
    expect(runsEveryUnitTest('src/app/ui/Button.tsx')).toBe(false);
    expect(runsEveryUnitTest('convex/factions.ts')).toBe(false);
    expect(runsEveryUnitTest('.github/workflows/chromatic.yml')).toBe(false);
  });

  test('a test that opens files or starts processes reads by path', () => {
    expect(readsFilesByPath("import { readFileSync } from 'node:fs';")).toBe(true);
    expect(readsFilesByPath('import { readdir } from "fs/promises";')).toBe(true);
    expect(readsFilesByPath("import { spawnSync } from 'node:child_process';")).toBe(true);
    expect(readsFilesByPath('const text = await Bun.file(path).text();')).toBe(true);
    expect(readsFilesByPath("import { describe } from 'vite-plus/test';\nimport { add } from './add';")).toBe(false);
  });

  test('the listing excludes what the package test script excludes', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string } }).scripts;
    expect(testScriptExcludes(scripts.test)).toEqual(['workers/game/**', 'workers/publisher/**']);
  });

  test('the selection is the union of both sets, each file once', () => {
    expect(draftSelection(['src/b.test.ts', 'scripts/a.test.ts'], ['scripts/a.test.ts', 'scripts/c.test.ts'])).toEqual([
      'scripts/a.test.ts',
      'scripts/c.test.ts',
      'src/b.test.ts',
    ]);
  });
});
