import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { test, vi } from 'vitest';

import { prepareHostedBackend } from './hosted-backend';

test('the generated backend provisions only inside its isolated run window', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'play-backend-'));
  const target = {
    project: 'norbert-de-langen:dunezone-play-load',
    reference: 'dev/native',
    backendName: 'isolated-load-1105',
    backendOrigin: 'https://isolated-load-1105.eu-west-1.convex.cloud',
    applicationOrigin: 'https://dunezone-play-load-native.ndelangen.workers.dev',
    gameWorker: 'dunezone-game-load-native',
    namespaceId: '1'.repeat(32),
    sourceRevision: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  };
  try {
    const backend = path.join(directory, 'backend');
    await prepareHostedBackend(backend, target);
    /* Bundle the real consumer so changes to its guard imports cannot silently break the generated backend. */
    await build({
      entryPoints: [path.join(backend, 'convex/playProvisioning.ts')],
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      logLevel: 'silent',
    });
    const guard = await build({
      entryPoints: [path.join(backend, 'convex/lib/playSynthetic.ts')],
      bundle: true,
      platform: 'node',
      format: 'cjs',
      write: false,
    });
    const module = { exports: {} };
    new Function('module', 'exports', guard.outputFiles[0].text)(module, module.exports);
    const { isSyntheticBackend, requireSyntheticBackend } = module.exports;
    vi.stubEnv('CONVEX_CLOUD_URL', target.backendOrigin);
    vi.stubEnv('SITE_URL', target.applicationOrigin);
    vi.stubEnv('IS_TEST', 'true');
    vi.stubEnv('E2E_LOCAL_AUTH', 'true');
    vi.stubEnv(
      'PLAY_LOAD_RUN',
      JSON.stringify({ runId: 'a'.repeat(32), startsAt: Date.now() - 1000, expiresAt: Date.now() + 60_000 })
    );
    assert.equal(isSyntheticBackend(), true);
    assert.doesNotThrow(() => requireSyntheticBackend());
    for (const [key, value] of [
      ['CONVEX_CLOUD_URL', 'https://exuberant-finch-263.convex.cloud'],
      ['SITE_URL', 'https://dune.zone'],
      ['IS_TEST', 'false'],
      ['E2E_LOCAL_AUTH', 'false'],
      ['PLAY_LOAD_RUN', JSON.stringify({ runId: 'a'.repeat(32), startsAt: 1, expiresAt: 600_001 })],
      ['PLAY_LOAD_RUN', 'invalid'],
    ]) {
      const previous = process.env[key];
      vi.stubEnv(key, value);
      assert.equal(isSyntheticBackend(), false, key);
      assert.throws(() => requireSyntheticBackend(), undefined, key);
      vi.stubEnv(key, previous);
    }
  } finally {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
