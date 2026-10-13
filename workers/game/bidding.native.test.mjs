import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  accepted,
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';

describe('Optional timed bidding through the native game boundary', { timeout: 20_000 }, () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The native fixture did not provision.');
    }
    const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const state = JSON.parse(rows[0].data);
    state.phase = 3;
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(state)]);
    await runtime.restart();
    await runtime.clock(60_000);
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  it('shares the optional clock, cancels and restarts it, then passes from a persisted alarm with nobody connected', async () => {
    const a = await admitPlayer(peer, runtime, 'a');
    const b = await admitPlayer(peer, runtime, 'b');
    const observer = await admitPlayer(peer, runtime, 'observer');
    const faction = (await syncView(a)).snapshot.bank.factionId;
    await accepted(a, { kind: 'bid-start', factionId: faction });
    expect((await syncView(a)).snapshot.bidding).toMatchObject({ timed: false, deadline: null });
    const denied = await sendCommand(observer, { kind: 'bid-timing', enabled: true });
    expect(denied.reply.type).toBe('rejected');
    await accepted(a, { kind: 'bid-timing', enabled: true });
    const waiting = await accepted(a, { kind: 'bid-start', factionId: faction });
    expect(waiting.snapshot.bidding).toMatchObject({ timed: true, started: false, deadline: null });
    const round = waiting.snapshot.bidding.round;
    const raised = await accepted(a, { kind: 'bid-raise', round });
    const first = raised.snapshot.bidding.deadline;
    expect(first - raised.serverNow).toBeGreaterThan(24_000);
    expect(first - raised.serverNow).toBeLessThanOrEqual(25_000);
    for (const connection of [b, observer]) {
      expect((await syncView(connection)).snapshot.bidding.deadline).toBe(first);
    }
    await runtime.clock(62_000);
    const off = await accepted(b, { kind: 'bid-timing', enabled: false });
    expect(off.snapshot.bidding.deadline).toBeNull();
    expect((await runtime.alarm()).scheduledAt).toBeNull();
    const resumed = await accepted(b, { kind: 'bid-timing', enabled: true });
    const deadline = resumed.snapshot.bidding.deadline;
    expect(deadline).toBeGreaterThan(first);
    expect((await runtime.alarm()).scheduledAt).toBe(deadline);
    /* Twenty seconds drain the ring; passing waits through all five warning seconds. */
    await runtime.clock(deadline - Date.now() - 2500);
    await runtime.alarm(true);
    expect((await syncView(a)).snapshot.bidding.turn).toBe(faction);
    for (const connection of [a, b, observer]) {
      connection.socket.close();
    }
    await runtime.restart();
    await runtime.clock(deadline - Date.now() + 100);
    await runtime.alarm(true);
    await eventually(async () => {
      const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
      return JSON.parse(rows[0].data).bidding.turn !== faction;
    }, 'automatic pass without a connected browser');
    const rejoined = await admitPlayer(peer, runtime, 'a');
    const next = (await syncView(rejoined)).snapshot.bidding;
    expect(next).toMatchObject({ timed: true, started: true, bid: { factionId: faction, amount: 1 } });
    expect(next.deadline).toBeGreaterThan(deadline);
  });
});
