import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/**
 * Decides whether a merge needs the dev deployment's data rebuilt from production.
 *
 * Only changes that can invalidate or reshape dev's existing data qualify: the schema itself, and the migrations that reshape data within a schema (cloud dev runs no migrations of its own;
 * the rebuild replaced them, so a migration that never reached dev's data is a stale-data bug).
 *
 * Every merge still pushes code to dev, which doubles as the safety net for a missed rebuild: Convex validates existing data against the pushed schema, so data left stale by a skipped rebuild fails that push loudly on the very next merge.
 */
export function needsDataRebuild(changedFiles: readonly string[]): boolean {
  return changedFiles.some((file) => {
    if (file.endsWith('.test.ts')) {
      return false;
    }
    return (
      file === 'convex/schema.ts' || file === 'convex/migration-guards.json' || /^convex\/migrations.*\.ts$/.test(file)
    );
  });
}

type Decision = {
  rebuild: boolean;
  reason: string;
};

/** Spawning an absolute path keeps the lookup off PATH, which need not be trustworthy. */
function gitExecutable(): string {
  return Bun.which('git') ?? '/usr/bin/git';
}

function git(args: string[]) {
  return spawnSync(gitExecutable(), args, { encoding: 'utf8' });
}

function commitIsPresent(commit: string) {
  return git(['cat-file', '-e', `${commit}^{commit}`]).status === 0;
}

function changedFiles(base: string, head: string): string[] {
  const result = git(['diff', '--name-only', base, head]);
  if (result.status !== 0) {
    throw new Error(`git diff ${base} ${head} failed: ${(result.stderr ?? '').trim()}`);
  }
  return result.stdout.split('\n').filter((line) => line.trim().length > 0);
}

export function decide(base: string, head: string, force: boolean): Decision {
  if (force) {
    return { rebuild: true, reason: 'rebuild was forced' };
  }
  // Unknown history (first push, force push, manual run) errs toward rebuilding.
  if (base.length === 0 || /^0+$/.test(base)) {
    return { rebuild: true, reason: 'no base commit to compare against' };
  }
  if (!commitIsPresent(base)) {
    return { rebuild: true, reason: `base commit ${base} is missing from this checkout` };
  }
  const files = changedFiles(base, head);
  if (needsDataRebuild(files)) {
    return { rebuild: true, reason: 'schema or migration files changed' };
  }
  return { rebuild: false, reason: `no schema or migration changes across ${files.length} files` };
}

if (import.meta.main) {
  const decision = decide(
    process.env.DEV_REBUILD_BASE?.trim() ?? '',
    process.env.DEV_REBUILD_HEAD?.trim() || 'HEAD',
    process.env.DEV_REBUILD_FORCE === 'true'
  );
  console.log(decision.rebuild ? `Rebuilding dev data: ${decision.reason}.` : `Keeping dev data: ${decision.reason}.`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `rebuild=${decision.rebuild}\n`);
  }
}
