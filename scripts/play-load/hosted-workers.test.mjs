import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { test } from 'vitest';

import { prepareHostedWorkers } from './hosted-workers.mjs';

test('an uploaded game activates through bindings and retains its stop after restart', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const base = await mkdtemp(path.join(tmpdir(), 'play-activation-'));
  try {
    const target = {
      project: 'norbert-de-langen:dunezone-play-load',
      reference: 'dev/native',
      backendName: 'isolated-load-1105',
      backendOrigin: 'https://isolated-load-1105.eu-west-1.convex.cloud',
      applicationOrigin: 'https://dunezone-play-load-native.ndelangen.workers.dev',
      gameWorker: 'dunezone-game-load-native',
      namespaceId: '1'.repeat(32),
      sourceRevision: execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    };
    const run = { runId: 'a'.repeat(32), startsAt: Date.now(), expiresAt: Date.now() + 600_000 };
    const config = await prepareHostedWorkers({
      directory: path.join(base, 'workers'),
      target,
      run,
      gameId: 'proof-game',
      assets: base,
    });
    const built = await build({
      entryPoints: [path.join(path.dirname(config.gameConfig), 'game.ts')],
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      external: ['cloudflare:workers'],
    });
    const common = {
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: '2026-08-11',
      compatibilityFlags: ['nodejs_compat'],
      durableObjects: { GAME_ROOMS: { className: 'GameRoom', useSQLite: true } },
    };
    const bindings = {
      CONVEX_URL: 'http://127.0.0.1:1',
      APPLICATION_ORIGIN: target.applicationOrigin,
      GIT_SHA: target.sourceRevision,
      LOAD_CONTROL_SECRET: 'b'.repeat(64),
    };
    const mf = new Miniflare(convertV4MiniflareOptions({ ...common, bindings }));
    const url = target.applicationOrigin + '/__play/games/proof-game/load-control';
    const headers = { Authorization: 'Bearer ' + 'b'.repeat(64) };
    try {
      assert.equal((await mf.dispatchFetch(url, { headers })).status, 410);
      const activation = JSON.parse(await readFile(config.activationFile, 'utf8'));
      await mf.setOptions(convertV4MiniflareOptions({ ...common, bindings: { ...bindings, ...activation } }));
      const active = await (await mf.dispatchFetch(url, { headers })).json();
      assert.equal(active.gameId, 'proof-game');
      assert.equal(active.stopped, null);
      assert.equal((await mf.dispatchFetch(url.replace('proof-game', 'wrong'), { headers })).status, 403);
      const stopped = await (await mf.dispatchFetch(url, { headers, method: 'DELETE' })).json();
      assert.ok(stopped.stopped);
      assert.equal(stopped.alarm, null);
      assert.ok(Object.values(stopped.rows).every((x) => x === 0));
      await mf.setOptions(convertV4MiniflareOptions({ ...common, bindings: { ...bindings, ...activation } }));
      const restarted = await (await mf.dispatchFetch(url, { headers })).json();
      assert.equal(restarted.stopped, stopped.stopped);
    } finally {
      await mf.dispose();
    }
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
