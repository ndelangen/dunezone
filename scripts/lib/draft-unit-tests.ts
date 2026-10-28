/*
 * Which unit test files a draft pull request run executes.
 * A draft runs the files Vitest finds affected by the pull request's changes through its module graph, and every file that reads others by path, which that graph cannot see.
 * A change to what every verify job reads (the dependency graph, the workflows, the root configuration) runs every file.
 * The full run that `ci_ok` waits for always runs every file with coverage, so a draft only learns sooner what the full run checks anyway.
 */
import { EVERY_JOB } from './ci-job-inputs';
import { globToRegExp } from './hosted-play-closure';
import { byCodeUnit } from './storybook-shards';

const everyJob = EVERY_JOB.map(globToRegExp);

/** Whether a change to this file can change the outcome of any unit test file. */
export function runsEveryUnitTest(file: string): boolean {
  return everyJob.some((pattern) => pattern.test(file));
}

/* A test that opens files, lists directories or starts processes can read a file it never imports. */
const READS_BY_PATH = /from ['"](?:node:)?(?:fs|fs\/promises|child_process)['"]|\bBun\.(?:file|spawn|spawnSync|\$)\b/u;

/** Whether a test file's source reads repository files by path. */
export function readsFilesByPath(source: string): boolean {
  return READS_BY_PATH.test(source);
}

/** The `--exclude` globs of the package's `test` script, so listing sees the same files as running. */
export function testScriptExcludes(script: string): string[] {
  return [...script.matchAll(/--exclude\s+'([^']+)'/gu)].map((match) => match[1]);
}

/** The files to run: those affected by the changes, and those that read files by path, in code-unit order. */
export function draftSelection(affected: readonly string[], byPath: readonly string[]): string[] {
  return [...new Set([...affected, ...byPath])].sort(byCodeUnit);
}
