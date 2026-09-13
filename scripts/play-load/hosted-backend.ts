import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hostedTargetSchema } from '../../src/shared/play/loadTarget.ts';
import type { HostedLoadTarget } from '../../src/shared/play/loadTarget.ts';
import { privateOutputDirectory } from './hosted-paths.ts';

const root = path.resolve(import.meta.dirname, '../..');

function guardSource(target: HostedLoadTarget) {
  return `import { hostedLoadIdentity, hostedTargetSchema, requireHostedRun as requireRun } from '../../src/shared/play/loadTarget';
import type { Value } from 'convex/values';

const target = hostedTargetSchema.parse(${JSON.stringify(target)});

export function requireHostedRun() {
  return requireRun(target, process.env);
}

export function loadIdentity(params: Record<string, Value | undefined>) {
  return hostedLoadIdentity(target, process.env, params);
}
`;
}

async function replaceOnce(filename: string, before: string, after: string) {
  const source = await readFile(filename, 'utf8');
  assert.equal(source.split(before).length, 2, `Isolated backend source changed: ${path.basename(filename)}.`);
  await writeFile(filename, source.replace(before, after));
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
  await writeFile(path.join(directory, 'convex/lib/playHostedGuard.ts'), guardSource(target));
  await writeFile(
    path.join(directory, 'convex/lib/playSynthetic.ts'),
    "export { requireHostedRun as requireSyntheticBackend } from './playHostedGuard';\n"
  );
  const auth = path.join(directory, 'convex/auth.ts');
  await replaceOnce(
    auth,
    'import { applicationTriggers }',
    "import { loadIdentity } from './lib/playHostedGuard';\nimport { applicationTriggers }"
  );
  await replaceOnce(auth, 'providers.push(Password);', 'providers.push(Password({ profile: loadIdentity }));');
  await replaceOnce(
    path.join(directory, 'convex/playTesting.ts'),
    '    if (args.useHostedRoute) {',
    "    if (await ctx.db.query('play_games').first()) { throw new Error('The hosted load backend already has a game.'); }\n    if (args.useHostedRoute) {"
  );
  await writeFile(
    path.join(directory, 'convex/crons.ts'),
    "import { cronJobs } from 'convex/server';\nexport default cronJobs();\n"
  );
  const changed = [
    'convex/lib/playHostedGuard.ts',
    'convex/lib/playSynthetic.ts',
    'convex/auth.ts',
    'convex/playTesting.ts',
    'convex/crons.ts',
  ];
  const sources = Object.fromEntries(
    await Promise.all(changed.map(async (file) => [file, await readFile(path.join(directory, file), 'utf8')]))
  );
  await writeFile(path.join(directory, 'load-source.json'), JSON.stringify({ target, revision, sources }, null, 2));
  return { directory, target, revision };
}
