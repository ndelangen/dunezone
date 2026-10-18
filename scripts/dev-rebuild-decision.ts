import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

/** The files beside the snapshot policy and the anonymiser (`scripts/lib/snapshot-*.ts`, `scripts/snapshot-*.ts`) that decide what dev's data is. */
const SNAPSHOT_PIPELINE_FILES: ReadonlySet<string> = new Set([
  'scripts/anonymised-snapshot.ts',
  'convex/lib/provisioningContract.ts',
  'convex/provisioningChecks.ts',
  '.github/workflows/dev-rebuild.yml',
]);

/**
 * Decides whether a merge needs the dev deployment's data rebuilt from the anonymised snapshot (#1559).
 *
 * Two kinds of change qualify.
 * The first can invalidate or reshape dev's existing data: the schema itself, and the migrations that reshape data within a schema (a migration that never reached dev's data is a stale-data bug).
 * A merge whose only such files are migrations does not rebuild: dev runs the new migrations on its own data instead (`needsOnlyMigrations`), which spares a production export.
 * The second changes what the snapshot keeps or how it is made, loaded and checked: the snapshot policy, the anonymiser, the rebuild contract and the rebuild workflow.
 * Dev holds what the last rebuild made, so a tightened policy reaches dev only through a rebuild.
 *
 * Every merge still pushes code to dev, which doubles as the safety net for a missed rebuild: Convex validates existing data against the pushed schema, so data left stale by a skipped rebuild fails that push loudly on the very next merge.
 */
export function needsDataRebuild(changedFiles: readonly string[]): boolean {
  return changedFiles.some((file) => {
    if (file.endsWith('.test.ts')) {
      return false;
    }
    return (
      file === 'convex/schema.ts' ||
      file === 'convex/migration-guards.json' ||
      /^convex\/migrations.*\.ts$/.test(file) ||
      SNAPSHOT_PIPELINE_FILES.has(file) ||
      /^scripts\/(?:lib\/)?snapshot-[^/]+\.ts$/.test(file)
    );
  });
}

/** The files that only add or change migrations: dev can run those on the data it holds, as production does. */
function isMigrationFile(file: string): boolean {
  return file === 'convex/migration-guards.json' || /^convex\/migrations.*\.ts$/.test(file);
}

/**
 * True when the merge's data-relevant files are all migration files.
 * The schema is unchanged, so dev's data still satisfies it, and running the new migrations on dev reshapes that data the way the deploy reshapes production's.
 * That saves a full production export for each such merge.
 */
export function needsOnlyMigrations(changedFiles: readonly string[]): boolean {
  const relevant = changedFiles.filter((file) => needsDataRebuild([file]));
  return relevant.length > 0 && relevant.every(isMigrationFile);
}

type Decision = {
  rebuild: boolean;
  /** Push the code, then run the migrations the merge added on dev's existing data. */
  migrate: boolean;
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
    return { rebuild: true, migrate: false, reason: 'rebuild was forced' };
  }
  // Unknown history (first push, force push, manual run) errs toward rebuilding.
  if (base.length === 0 || /^0+$/.test(base)) {
    return { rebuild: true, migrate: false, reason: 'no base commit to compare against' };
  }
  if (!commitIsPresent(base)) {
    return { rebuild: true, migrate: false, reason: `base commit ${base} is missing from this checkout` };
  }
  const files = changedFiles(base, head);
  if (needsOnlyMigrations(files)) {
    return { rebuild: false, migrate: true, reason: 'only migration files changed' };
  }
  if (needsDataRebuild(files)) {
    return { rebuild: true, migrate: false, reason: 'schema or snapshot files changed' };
  }
  return {
    rebuild: false,
    migrate: false,
    reason: `no schema, migration or snapshot changes across ${files.length} files`,
  };
}

if (import.meta.main) {
  const decision = decide(
    process.env.DEV_REBUILD_BASE?.trim() ?? '',
    process.env.DEV_REBUILD_HEAD?.trim() || 'HEAD',
    process.env.DEV_REBUILD_FORCE === 'true'
  );
  const verdict = decision.rebuild
    ? 'Rebuilding dev data'
    : decision.migrate
      ? 'Migrating dev data in place'
      : 'Keeping dev data';
  console.log(`${verdict}: ${decision.reason}.`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `rebuild=${decision.rebuild}\nmigrate=${decision.migrate}\n`);
  }
}
