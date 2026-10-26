import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { PHASE_CHANGE_COOLDOWN_MS } from '../../src/shared/play/phases';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.ts';

/* The bindings `scripts/play-local.ts` gives the isolated local stack's game Worker. */
const LOCAL_ISOLATED = { GIT_SHA: 'local-isolated', APPLICATION_ORIGIN: 'http://127.0.0.1:8787' };

describe("A synthetic backend's test phase cooldown", () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
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
    const player = await admitPlayer(runtime, 'a');
    await accepted(player, { kind: 'phase' as const });
    expect((await sendCommand(player, { kind: 'phase' as const })).reply).toMatchObject({
      type: 'rejected' as const,
      message: expect.stringContaining('between phase changes'),
    });
  });

  it('runs the game without waiting between phases in the isolated local stack, across a restart', async () => {
    runtime = await createRuntime(peer, 'game', LOCAL_ISOLATED);
    peer.testPhaseCooldownMs = 0;
    expect((await provision(runtime)).status).toBe(200);
    let player = await admitPlayer(runtime, 'a');
    for (const phase of [1, 2]) {
      const view = await accepted(player, { kind: 'phase' as const });
      expect(view.snapshot.phase).toBe(phase);
      expect(view.phaseCooldownMs).toBe(0);
    }
    await runtime.restart();
    player = await admitPlayer(runtime, 'a');
    expect((await accepted(player, { kind: 'phase' as const })).snapshot.phase).toBe(3);
  });
});

describe("The phase cooldown during a real game's setup", () => {
  let peer: NativePeer, runtime: NativeRuntime;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  it.each([
    [
      'a Worker outside the isolated local stack refuses',
      {},
      `Wait ${PHASE_CHANGE_COOLDOWN_MS / 1000} seconds between phase changes.`,
    ],
    [
      'the isolated local stack with a test cooldown of 0 accepts',
      { bindings: LOCAL_ISOLATED, testPhaseCooldownMs: 0 },
      null,
    ],
  ])('%s a second setup phase change inside the real cooldown', async (_, options, refusal) => {
    ({ peer, runtime } = await draftingRuntime([], undefined, options));
    const [a, b] = await dealt(runtime);
    for (const player of [a, b]) {
      const view = await syncView(player);
      await accepted(player, {
        kind: 'swap-ready' as const,
        ready: true,
        round: required(view.snapshot.swapping).round,
        seat: view.viewer.viewerSeat,
      });
    }
    for (const player of [a, b]) {
      await accepted(player, { kind: 'ready' as const, ready: true });
    }
    expect((await accepted(a, { kind: 'phase' as const })).snapshot.stage).toBe('setup');
    const { reply } = await sendCommand(a, { kind: 'phase' as const, direction: -1 });
    expect(reply.type === 'rejected' ? reply.message : null).toBe(refusal);
  });
});
