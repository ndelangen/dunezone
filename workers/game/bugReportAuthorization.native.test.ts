import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import type { NativePeer, NativeRuntime } from './native-runtime.fixture';
import { createPeer, createRuntime, fixturePass, provision } from './native-runtime.fixture';

let peer: NativePeer;
let runtime: NativeRuntime;
beforeEach(async () => {
  peer = await createPeer();
  runtime = await createRuntime(peer, 'game');
  const response = await provision(runtime);
  if (response.status !== 200) {
    throw new Error(`Fixture provisioning failed: ${response.status}`);
  }
});
afterEach(async () => {
  await runtime?.close();
  await peer?.close();
});

async function report(overrides: Record<string, unknown> = {}, origin = runtime.origin) {
  return await runtime.fetch('/__play/games/fixture-game/reports', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: 'send',
      requestId: randomUUID(),
      pass: await fixturePass('a'),
      description: 'A troop cannot be moved.',
      browser: {
        snapshot: {},
        conversations: {},
        logs: [],
        droppedLogs: 0,
        diagnostics: {
          clientRevision: 0,
          connection: 'authorized',
          viewport: [1280, 800],
          pixelRatio: 1,
          language: 'en',
          userAgent: 'test',
          online: true,
        },
      },
      ...overrides,
    }),
  });
}

test('refuses cross-origin, forged and expired credentials and empty descriptions before report storage', async () => {
  expect((await report({}, 'https://elsewhere.test')).status).toBe(403);
  expect((await report({ pass: 'forged' })).status).toBe(403);
  expect((await report({ pass: await fixturePass('a', { exp: Date.now() - 1 }) })).status).toBe(403);
  expect((await report({ description: ' \n\t ' })).status).toBe(400);
  expect(peer.requests.filter((request) => request.function === 'playBugReports:authorize')).toHaveLength(0);
});

test('requires a live Convex session as well as a valid signed pass', async () => {
  peer.httpMode = 'deny';
  expect((await report()).status).toBe(403);
  expect(peer.requests.filter((request) => request.function === 'playBugReports:authorize')).toHaveLength(1);
});
