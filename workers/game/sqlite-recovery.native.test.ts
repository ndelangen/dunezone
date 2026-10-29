import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';
import { expect, it } from 'vite-plus/test';

import { createPeer, createRuntime, provision } from './native-runtime.fixture';

const productionEntry = fileURLToPath(new URL('./index.ts', import.meta.url));
const bundle = await build({
  entryPoints: [fileURLToPath(new URL('./sqlite-recovery.native.fixture.ts', import.meta.url))],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  external: ['cloudflare:workers', 'node:*'],
  plugins: [
    {
      name: 'native-sqlite-load-failure',
      setup(builder) {
        builder.onResolve({ filter: /^\.\/session$/ }, ({ importer }) =>
          importer === productionEntry
            ? { path: fileURLToPath(new URL('./sqlite-recovery-session.native.fixture.ts', import.meta.url)) }
            : undefined
        );
      },
    },
  ],
});

it('reconstructs on the next connection after a SQLite allocation failure, preserving the saved game', async () => {
  const peer = await createPeer();
  const runtime = await createRuntime(peer, 'game', {}, bundle.outputFiles[0].text);
  try {
    expect((await provision(runtime)).status).toBe(200);
    const saved = await runtime.exec('SELECT data FROM current_state');
    /*
     * Compiling a whole-database check exceeds workerd's VDBE allocation limit even with no rows.
     * This produces native SQLITE_NOMEM without breaking storage. It tests recovery from that
     * error, not the unexplained allocation failure in the much smaller production database.
     * 600 tables exceed both the older 25,000 and newer 250,000 instruction limits.
     */
    const columns = Array.from(
      { length: 24 },
      (_, i) => `c${i} INTEGER NOT NULL CHECK(typeof(c${i})='integer' AND c${i}>=0)`
    );
    for (let table = 0; table < 600; table++) {
      await runtime.exec(`CREATE TABLE allocation_probe_${table} (${columns.join(',')})`);
    }
    expect((await runtime.object('fixture-game', '/native-test/fail-next-load', { method: 'POST' })).status).toBe(204);
    await runtime.hibernateRoom();
    const connect = () =>
      runtime.fetch('/__play/games/fixture-game/socket', {
        headers: { Origin: runtime.origin, Upgrade: 'websocket' },
      });
    expect((await connect()).status).toBeGreaterThanOrEqual(400);

    /* The normal connection must recover without a fixture inspection or explicit eviction. */
    const connected = await connect();
    expect(connected.status).toBe(101);
    connected.webSocket?.accept();
    connected.webSocket?.close();
    expect(await (await runtime.object('fixture-game', '/native-test/load-failure')).json()).toEqual({
      message: 'out of memory: SQLITE_NOMEM',
    });
    expect(await runtime.exec('SELECT data FROM current_state')).toEqual(saved);
  } finally {
    await runtime.close();
    await peer.close();
  }
}, 30_000);
