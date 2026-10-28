/*
 * Runs the unit test files a draft pull request run needs (see `scripts/lib/draft-unit-tests.ts`), passing the remaining arguments to the run.
 * The `test` job runs it on a draft against the merge commit's first parent, the base branch the pull request merges into.
 * Run: `bun scripts/draft-unit-tests.ts <base> [vitest run arguments…]`
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { draftSelection, readsFilesByPath, runsEveryUnitTest, testScriptExcludes } from './lib/draft-unit-tests';

const [base, ...runArguments] = process.argv.slice(2);
if (!base) {
  console.error('Name the commit to compare against, for example HEAD^1 on a pull request merge commit.');
  process.exit(1);
}

function summary(markdown: string): void {
  console.log(markdown);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

/** Runs `vp test run` through the package's `test` script, so it keeps that script's exclusions, and exits with its status. */
function runTests(files: readonly string[]): never {
  const run = spawnSync(process.execPath, ['run', 'test', ...files, ...runArguments], { stdio: 'inherit' });
  process.exit(run.status ?? 1);
}

const diff = spawnSync('/usr/bin/git', ['diff', '--name-only', '-z', base, 'HEAD'], { encoding: 'utf8' });
if (diff.status !== 0) {
  console.error(diff.stderr);
  process.exit(1);
}
const changed = diff.stdout.split('\0').filter((file) => file.length > 0);
const everything = changed.filter(runsEveryUnitTest);
if (everything.length > 0) {
  const named = everything.map((file) => '`' + file + '`').join(', ');
  summary(`Unit tests: all files, since every job reads ${named}.`);
  runTests([]);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string } };
const excludes = testScriptExcludes(packageJson.scripts.test).flatMap((glob) => ['--exclude', glob]);
const listing = mkdtempSync(join(tmpdir(), 'draft-unit-tests-'));

/** The test files `vp test list` names with these arguments, relative to the repository. */
function listFiles(name: string, extra: readonly string[]): string[] {
  const output = join(listing, `${name}.json`);
  const list = spawnSync(
    process.execPath,
    ['x', 'vp', 'test', 'list', '--filesOnly', `--json=${output}`, ...excludes, ...extra],
    { stdio: ['ignore', 'ignore', 'inherit'] }
  );
  if (list.status !== 0) {
    process.exit(list.status ?? 1);
  }
  return (JSON.parse(readFileSync(output, 'utf8')) as { file: string }[]).map(({ file }) => relative('.', file));
}

const affected = listFiles('affected', ['--changed', base]);
const byPath = listFiles('all', []).filter((file) => readsFilesByPath(readFileSync(file, 'utf8')));
const files = draftSelection(affected, byPath);
summary(
  [
    `Unit tests: ${files.length} files, ${affected.length} affected by ${changed.length} changed files and ${byPath.length} that read files by path.`,
    '',
    '<details><summary>Files</summary>',
    '',
    ...files.map((file) => `- \`${file}\``),
    '',
    '</details>',
  ].join('\n')
);
runTests(files);
