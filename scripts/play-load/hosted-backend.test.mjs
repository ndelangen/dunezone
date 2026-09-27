import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { test, vi } from 'vitest';

import { prepareHostedBackend } from './hosted-backend';
import { syntheticHostedTarget } from './synthetic-target.ts';

const root = path.resolve(import.meta.dirname, '../..');

test('the copy replaces only its generated modules, and its seam limits sign-in and fixtures to the run', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'play-backend-'));
  const target = syntheticHostedTarget(
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  );
  try {
    const backend = path.join(directory, 'backend');
    await prepareHostedBackend(backend, target);
    /*
     * The record and the files below are the copy's output, not the generator's source.
     * The copy replaces whole modules and records them, so the code under load is otherwise production source.
     */
    const generated = ['convex/crons.ts', 'convex/lib/playSynthetic.ts'];
    const { sources } = JSON.parse(await readFile(path.join(backend, 'load-source.json'), 'utf8'));
    assert.deepEqual(Object.keys(sources).sort(), generated);
    const tracked = execFileSync('/usr/bin/git', ['ls-files', '-z', 'convex', 'src/shared'], { cwd: root })
      .toString()
      .split('\0')
      .filter((file) => file && !generated.includes(file));
    for (const file of tracked) {
      assert.ok((await readFile(path.join(backend, file))).equals(await readFile(path.join(root, file))), file);
    }
    /* Loading playProvisioning.ts fails if the copy stops exporting a name it imports from the seam. */
    await load(backend, 'convex/playProvisioning.ts');
    const { isSyntheticBackend, requireSyntheticBackend, syntheticIdentity } = await load(
      backend,
      'convex/lib/playSynthetic.ts'
    );
    const runId = 'a'.repeat(32);
    const account = { email: `load-0-${runId}@example.invalid`, password: 'p'.repeat(32), flow: 'signIn' };
    vi.stubEnv('CONVEX_CLOUD_URL', target.backendOrigin);
    vi.stubEnv('SITE_URL', target.applicationOrigin);
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv('PLAY_LOAD_RUN', JSON.stringify({ runId, startsAt: Date.now() - 1000, expiresAt: Date.now() + 60_000 }));
    assert.equal(isSyntheticBackend(), true);
    assert.doesNotThrow(() => requireSyntheticBackend());
    assert.deepEqual(syntheticIdentity(account), { email: account.email });
    assert.throws(() => syntheticIdentity({ ...account, email: 'player@example.invalid' }), /fixed synthetic/);
    /*
     * Run the copy's consumers the way Convex Auth and Convex call them, so one that stops passing the seam fails here.
     * The stub hands convexAuth's config back as auth.ts's `auth` export.
     * Convex Auth calls a provider given as a function and takes authorize from its options (provider_utils.js:56, :73).
     */
    const { auth } = await load(backend, 'convex/auth.ts', {
      '@convex-dev/auth/server': 'export const convexAuth = (config) => ({ auth: config });',
    });
    const password = auth.providers
      .map((provider) => (typeof provider === 'function' ? provider() : provider))
      .find((provider) => provider.options?.id === 'password');
    await assert.rejects(
      password.options.authorize({ ...account, email: 'player@example.invalid' }, {}),
      /fixed synthetic/
    );
    const { createFixture } = await load(backend, 'convex/playTesting.ts', {
      './functions': 'export const internalMutation = (definition) => definition;',
    });
    /* Every query on this ctx finds a live game. */
    const games = { filter: () => games, withIndex: () => games, first: async () => ({ state: 'ready' }) };
    await assert.rejects(createFixture.handler({ db: { query: () => games } }, {}), /already has a live game/);
    for (const [key, value] of [
      ['CONVEX_CLOUD_URL', 'https://exuberant-finch-263.convex.cloud'],
      ['SITE_URL', 'https://dune.zone'],
      ['IS_TEST', 'false'],
      ['E2E_LOCAL_AUTH', 'false'],
      ['PLAY_LOAD_RUN', JSON.stringify({ runId, startsAt: 1, expiresAt: 600_001 })],
      ['PLAY_LOAD_RUN', 'invalid'],
    ]) {
      const previous = process.env[key];
      vi.stubEnv(key, value);
      assert.equal(isSyntheticBackend(), false, key);
      assert.throws(() => requireSyntheticBackend(), undefined, key);
      assert.throws(() => syntheticIdentity(account), undefined, key);
      vi.stubEnv(key, previous);
    }
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});

/** Bundles one of the copy's modules and runs it, with the named imports of that module alone replaced by stubs. */
async function load(backend, file, stubs = {}) {
  /* esbuild reports the importer by its real path, and on macOS the temporary directory sits under the /var symlink. */
  const entry = await realpath(path.join(backend, file));
  const bundle = await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    write: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'stubs',
        setup(build) {
          build.onResolve({ filter: /./ }, (args) =>
            args.importer === entry && Object.hasOwn(stubs, args.path)
              ? { path: args.path, namespace: 'stub' }
              : undefined
          );
          build.onLoad({ filter: /./, namespace: 'stub' }, (args) => ({ contents: stubs[args.path] }));
        },
      },
    ],
  });
  const module = { exports: {} };
  new Function('module', 'exports', bundle.outputFiles[0].text)(module, module.exports);
  return module.exports;
}
