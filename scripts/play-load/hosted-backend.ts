import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hostedTargetSchema } from '../../src/shared/play/loadTarget.ts';
import type { HostedLoadTarget } from '../../src/shared/play/loadTarget.ts';
import { privateOutputDirectory } from './hosted-paths.ts';

const root = path.resolve(import.meta.dirname, '../..');

/** The modules the copy writes in place of production's: the synthetic-backend seam bound to the target, and no crons. */
function generatedSources(target: HostedLoadTarget) {
  return {
    'convex/lib/playSynthetic.ts': `import type { Value } from 'convex/values';

import { hostedLoadIdentity, hostedTargetSchema, requireHostedRun } from '../../src/shared/play/loadTarget';
import type { MutationCtx } from '../_generated/server';

const target = hostedTargetSchema.parse(${JSON.stringify(target)});

export function requireSyntheticBackend() {
  requireHostedRun(target, process.env);
}

export function isSyntheticBackend() {
  try {
    requireSyntheticBackend();
    return true;
  } catch {
    return false;
  }
}

export function syntheticIdentity(params: Record<string, Value | undefined>) {
  return hostedLoadIdentity(target, process.env, params);
}

/* One live game at a time: a retired cell's game stays as a record, and the next cell creates its own. */
export async function limitLiveGames(ctx: MutationCtx) {
  if (await ctx.db.query('play_games').filter((q) => q.neq(q.field('state'), 'expired')).first()) {
    throw new Error('The hosted load backend already has a live game.');
  }
}
`,
    'convex/crons.ts': "import { cronJobs } from 'convex/server';\nexport default cronJobs();\n",
  };
}

/** Copies tracked backend/shared sources only. Environment files and production credentials never enter the copy. */
export async function prepareHostedBackend(requested: string, supplied: unknown) {
  const target = hostedTargetSchema.parse(supplied);
  const revision = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  assert.equal(revision, target.sourceRevision, 'The backend copy must use the selected source revision.');
  const directory = await privateOutputDirectory(requested);
  const files = execFileSync('/usr/bin/git', ['ls-files', '-z', 'convex', 'src/shared'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    const destination = path.join(directory, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, file), destination);
  }
  for (const file of ['package.json', 'convex.json', 'tsconfig.json']) {
    await copyFile(path.join(root, file), path.join(directory, file));
  }
  await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'));
  const sources = generatedSources(target);
  for (const [file, source] of Object.entries(sources)) {
    await writeFile(path.join(directory, file), source);
  }
  await writeFile(path.join(directory, 'load-source.json'), JSON.stringify({ target, revision, sources }, null, 2));
  return { directory, target, revision };
}
