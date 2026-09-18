import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardPage, deckPage, slot } from './native-catalogue.fixture.mjs';
import { admitPlayer, createPeer, createRuntime, eventually, provision } from './native-runtime.fixture.mjs';

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
        seats: [{ seat: 'seat-1', userId: 'user-a', faction: null }],
        phase: null,
        lastActivityAt: expect.any(Number),
        result: null,
      },
    });
    /* The delivery carries the game credentials and nothing about the peer's other calls. */
    expect(deliveries()[0].headers['content-type']).toContain('application/json');

    const creator = await admitPlayer(peer, runtime, 'a');
    creator.send({ type: 'pointer', position: [1, 0, 1] });
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

  it('retries a failed delivery from the alarm with nobody connected, across a restart', async () => {
    peer.directoryMode = 'error';
    expect((await provision(runtime)).status).toBe(200);
    await eventually(() => deliveries().length === 1, 'failed opening delivery');
    await eventually(async () => (await runtime.alarm()).scheduledAt !== null, 'retry alarm');
    const first = await runtime.alarm();
    expect(first.scheduledAt).toBeGreaterThan(first.observedAt);
    expect(first.scheduledAt).toBeLessThanOrEqual(first.observedAt + 2000);

    await runtime.restart();
    peer.directoryMode = 'ack';
    /* The woken room owes the summary and delivers it without a player or a fresh alarm. */
    await eventually(() => summaries().length >= 1, 'delivery after restart');
    expect(peer.summaries.at(-1)).toMatchObject({ sequence: 1, summary: { stage: 'drafting' } });
    await eventually(async () => (await runtime.alarm()).scheduledAt === null, 'settled alarm');
    expect(summaries().every((sequence) => sequence === 1)).toBe(true);
  });
});
