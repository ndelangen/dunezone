import type * as Esbuild from 'esbuild';
import { expect, test, vi } from 'vite-plus/test';

import { createPeer, createRuntime, provision } from './native-runtime.fixture';
import type { NativeRuntime } from './native-runtime.fixture';

const compiler = vi.hoisted(() => ({ allowed: true }));
vi.mock('esbuild', async (importOriginal) => {
  const actual = await importOriginal<typeof Esbuild>();
  return {
    ...actual,
    build: (...args: Parameters<typeof actual.build>) => {
      if (!compiler.allowed) {
        throw new Error('Native Worker compilation reached a running test.');
      }
      return actual.build(...args);
    },
  };
});

test('prepared Worker code creates independent native runtimes without compiling during the test', async () => {
  const peers = await Promise.all([createPeer(), createPeer()]);
  const runtimes: NativeRuntime[] = [];
  try {
    compiler.allowed = false;
    for (const peer of peers) {
      runtimes.push(await createRuntime(peer, 'game'));
    }
    for (const [index, runtime] of runtimes.entries()) {
      expect((await provision(runtime)).status).toBe(200);
      await runtime.exec('CREATE TABLE fixture_ownership (owner TEXT)');
      await runtime.exec('INSERT INTO fixture_ownership VALUES (?)', [`peer-${index}`]);
    }
    expect(await runtimes[0].exec('SELECT owner FROM fixture_ownership')).toEqual([{ owner: 'peer-0' }]);
    expect(await runtimes[1].exec('SELECT owner FROM fixture_ownership')).toEqual([{ owner: 'peer-1' }]);
  } finally {
    compiler.allowed = true;
    await Promise.all(runtimes.map((runtime) => runtime.close())).finally(() =>
      Promise.all(peers.map((peer) => peer.close()))
    );
  }
});

test('the native backend requires asset supply arguments and remains available after rejecting an invalid request', async () => {
  const peer = await createPeer();
  try {
    const query = (args: unknown) =>
      fetch(`${peer.url}/api/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'playCatalogue:assetSupply', args: [args] }),
      });
    expect((await query({})).status).toBe(400);
    expect(peer.requests).toHaveLength(0);
    const valid = await query({ type: 'card', slug: 'missing' });
    expect(valid.status).toBe(200);
    expect(await valid.json()).toMatchObject({ status: 'success', value: null });
    expect(peer.requests).toHaveLength(1);
  } finally {
    await peer.close();
  }
});
