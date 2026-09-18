import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TABLE_PHASES } from '../../src/shared/play/phases';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import {
  admitPlayer,
  createPeer,
  createRuntime,
  eventually,
  provision,
  sendCommand,
  syncView,
} from './native-runtime.fixture.mjs';

const CREATOR = { userId: 'user-a', displayName: 'Synthetic A' };
const DELETION = { gameId: 'fixture-game', secret: 'a'.repeat(64), userId: 'user-a', deletionOperationId: 'op-1' };

describe('A real game keeps the directory current', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.game = { rulesetId: 'ruleset-one', minimumPlayers: 4, creator: CREATOR };
    const card = cardPage('card-one');
    const [treachery, spice] = [deckPage('treachery-deck', [card]), deckPage('spice-deck', [card], 5)];
    for (const page of [card, treachery, spice]) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
    peer.rulesets.set('ruleset-one', {
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice)],
    });
    runtime = await createRuntime(peer, 'game');
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  const deliveries = () => peer.requests.filter((request) => request.function === 'playDirectory:publishSummary');
  const summaries = () => peer.summaries.map((request) => request.sequence);
  const deleteCreator = (eventId) =>
    runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...DELETION, eventId }),
    });

  it('publishes the opening summary once confirmed and again when the roster changes, and nothing for a pointer', async () => {
    expect((await provision(runtime)).status).toBe(200);
    await eventually(() => summaries().length === 1, 'opening summary');
    expect(peer.summaries[0]).toEqual({
      gameId: 'fixture-game',
      secret: 'a'.repeat(64),
      sequence: 1,
      summary: {
        stage: 'drafting',
        seatCount: 4,
        seats: [{ seat: 'seat-1', userId: 'user-a', faction: null }],
        phase: null,
        lastActivityAt: expect.any(Number),
        result: null,
      },
    });

    const creator = await admitPlayer(peer, runtime, 'a');
    creator.send({ type: 'pointer', seq: 1, position: [1, 0.38, 1] });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(summaries()).toEqual([1]);

    expect((await deleteCreator('evt-delete-1')).status).toBe(200);
    await eventually(() => summaries().length === 2, 'roster summary');
    expect(peer.summaries[1].sequence).toBe(2);
    expect(peer.summaries[1].summary.seats).toEqual([]);
    /* Nothing is owed once acknowledged: a restart delivers nothing more. */
    await runtime.restart();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(summaries()).toEqual([1, 2]);
    expect((await runtime.alarm()).scheduledAt).toBeNull();
  });

  it('keeps newer work owed when an older acknowledgment arrives late, and repeats without duplicate effect', async () => {
    peer.directoryMode = 'hold';
    expect((await provision(runtime)).status).toBe(200);
    await eventually(() => deliveries().length === 1, 'held opening delivery');
    /* The roster changes while sequence 1 is still in flight; nothing else is sent meanwhile. */
    expect((await deleteCreator('evt-delete-2')).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(summaries()).toEqual([1]);
    peer.directoryMode = 'ack';
    deliveries()[0].release({ ok: true, sequence: 1 });
    await eventually(() => summaries().length === 2, 'newer summary after the late acknowledgment');
    expect(peer.summaries[1]).toMatchObject({ sequence: 2, summary: { seats: [] } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(summaries()).toEqual([1, 2]);
    await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'settled alarm');
  });

  it('retries a failed delivery from the alarm with nobody connected, and a woken room delivers what it owes', async () => {
    peer.directoryMode = 'error';
    expect((await provision(runtime)).status).toBe(200);
    await eventually(() => deliveries().length === 1, 'failed opening delivery');
    await eventually(async () => (await runtime.alarm()).scheduledAt !== null, 'retry alarm');
    const first = await runtime.alarm();
    expect(first.scheduledAt).toBeGreaterThan(first.observedAt);
    expect(first.scheduledAt).toBeLessThanOrEqual(first.observedAt + 2000);
    /* The alarm fires with nobody connected; the second attempt is acknowledged. */
    peer.directoryMode = 'ack';
    await runtime.alarm(true);
    await eventually(() => summaries().length === 2, 'delivery from the alarm');
    expect(peer.summaries.at(-1)).toMatchObject({ sequence: 1, summary: { stage: 'drafting' } });
    await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'settled alarm');

    /* A failure with the alarm still far off, then a restart: the woken room delivers at once. */
    peer.directoryMode = 'error';
    expect((await deleteCreator('evt-delete-3')).status).toBe(200);
    await eventually(() => deliveries().length === 3, 'failed roster delivery');
    peer.directoryMode = 'ack';
    await runtime.restart();
    await eventually(() => summaries().length === 4, 'delivery after restart');
    expect(peer.summaries.at(-1)).toMatchObject({ sequence: 2, summary: { seats: [] } });
  });

  it('publishes an accepted command as activity once a minute, and never a pointer', async () => {
    expect((await provision(runtime)).status).toBe(200);
    await eventually(() => summaries().length === 1, 'opening summary');
    /* Play at the Mentat pause, where readiness is accepted: a stage no delivered path reaches yet. */
    const mentat = TABLE_PHASES.findIndex((phase) => phase.id === 'mentat-pause');
    await runtime.exec("UPDATE current_state SET data=json_set(data, '$.stage', 'play', '$.phase', ?) WHERE id=1", [
      mentat,
    ]);
    await runtime.restart();
    /* The clock jumps a minute below; the authorization lease must outlive it. */
    peer.expiresAt = () => Date.now() + 600_000;
    const creator = await admitPlayer(peer, runtime, 'a');
    expect((await syncView(creator)).snapshot.stage).toBe('play');
    /* The first accepted command publishes what the lobby now sees: play, at this phase. */
    const ready = await sendCommand(creator, { kind: 'ready', ready: true });
    expect(ready.reply.type).not.toBe('rejected');
    await eventually(() => summaries().length === 2, 'summary after the first command');
    expect(peer.summaries[1].summary).toMatchObject({ stage: 'play', phase: mentat });
    const at = peer.summaries[1].summary.lastActivityAt;

    /* A pointer is transient; readiness inside the minute is activity alone and stays unsent. */
    creator.send({ type: 'pointer', seq: 1, position: [1, 0.38, 1] });
    const unready = await sendCommand(creator, { kind: 'ready', ready: false });
    expect(unready.reply.type).not.toBe('rejected');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(summaries()).toEqual([1, 2]);

    /* The same table a minute later: activity alone earns one more sequence, carrying the newer time. */
    await runtime.clock(61_000);
    const again = await sendCommand(creator, { kind: 'ready', ready: true });
    expect(again.reply.type).not.toBe('rejected');
    await eventually(() => summaries().length === 3, 'activity after a minute');
    expect(peer.summaries[2].summary).toMatchObject({ stage: 'play', phase: mentat });
    expect(peer.summaries[2].summary.lastActivityAt).toBeGreaterThanOrEqual(at + 61_000);
    await runtime.clock(0);
  }, 20_000);
});
