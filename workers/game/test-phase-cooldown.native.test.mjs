import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { accepted, admitPlayer, createPeer, createRuntime, provision, sendCommand } from './native-runtime.fixture.mjs';

/* The bindings `scripts/play-local.ts` gives the isolated local stack's game Worker. */
const LOCAL_ISOLATED = { GIT_SHA: 'local-isolated', APPLICATION_ORIGIN: 'http://127.0.0.1:8787' };

describe("A synthetic backend's test phase cooldown", () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  it.each([
    ['a deployed Worker', { GIT_SHA: 'a'.repeat(40), APPLICATION_ORIGIN: 'https://dune.zone' }],
    ["play-local's marker on a public origin", { GIT_SHA: 'local-isolated', APPLICATION_ORIGIN: 'https://dune.zone' }],
    ["a loopback origin without play-local's marker", { APPLICATION_ORIGIN: 'http://127.0.0.1:8787' }],
  ])('is refused by %s, which provisions the game only with the real cooldown', async (_, bindings) => {
    runtime = await createRuntime(peer, 'game', bindings);
    peer.testPhaseCooldownMs = 0;
    expect((await provision(runtime)).status).toBe(403);
    peer.testPhaseCooldownMs = undefined;
    expect((await provision(runtime)).status).toBe(200);
    const player = await admitPlayer(peer, runtime, 'a');
    await accepted(player, { kind: 'phase' });
    expect((await sendCommand(player, { kind: 'phase' })).reply).toMatchObject({
      type: 'rejected',
      message: expect.stringContaining('between phase changes'),
    });
  });

  it('runs the game without waiting between phases in the isolated local stack, across a restart', async () => {
    runtime = await createRuntime(peer, 'game', LOCAL_ISOLATED);
    peer.testPhaseCooldownMs = 0;
    expect((await provision(runtime)).status).toBe(200);
    let player = await admitPlayer(peer, runtime, 'a');
    for (const phase of [1, 2]) {
      const view = await accepted(player, { kind: 'phase' });
      expect(view.snapshot.phase).toBe(phase);
      expect(view.phaseCooldownMs).toBe(0);
    }
    await runtime.restart();
    player = await admitPlayer(peer, runtime, 'a');
    expect((await accepted(player, { kind: 'phase' })).snapshot.phase).toBe(3);
  });
});
