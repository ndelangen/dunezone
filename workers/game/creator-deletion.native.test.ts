import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { arrakisBoardCapture } from '../../src/shared/play/fixtures/board';
import type { GameSnapshot } from '../../src/shared/play/protocol';
import { cardPage, deckPage, slot } from './native-catalogue.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativeConnection } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { admitPlayer, createPeer, createRuntime, eventually, provision, syncView } from './native-runtime.fixture.ts';
import type { Metadata } from './session';

describe('A real game removes its deleted creator from retained names', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
    /* A different actor has the same public name, so attribution must follow identity. */
    peer.game = {
      rulesetId: 'ruleset-one',
      minimumPlayers: 4,
      creator: { userId: 'user-a', displayName: 'Synthetic B' },
    };
    const card = cardPage('card-one');
    const treachery = deckPage('treachery-deck', [card]);
    const spice = deckPage('spice-deck', [card]);
    for (const page of [card, treachery, spice]) {
      peer.catalogue.set(`${page.asset.type}/${page.asset.slug}`, page);
    }
    peer.rulesets.set('ruleset-one', {
      board: arrakisBoardCapture,
      ruleset: { id: 'ruleset-one', slug: 'classic', name: 'Classic' },
      slots: [slot('treachery', treachery), slot('spice', spice)],
    });
    runtime = await createRuntime(peer, 'game');
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  async function prepareGame() {
    if ((await provision(runtime)).status !== 200) {
      throw new Error('Fixture provisioning failed.');
    }
  }

  async function creator() {
    const [{ data }] = await runtime.exec<{ data: string }>('SELECT data FROM metadata');
    const metadata = JSON.parse(data) as Metadata;
    return required(metadata.game).creator;
  }

  async function deleteAccount(userId: string) {
    const response = await runtime.fetch('/__play/games/fixture-game/account-deletion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameId: 'fixture-game',
        secret: 'a'.repeat(64),
        userId,
        eventId: `deletion-${userId}`,
        deletionOperationId: `operation-${userId}`,
      }),
    });
    expect(response.status).toBe(200);
  }

  const openingSeatEvent = (snapshot: GameSnapshot) => snapshot.table.events.find((event) => event.command === 'seat');

  async function assertAnonymized(observer: NativeConnection) {
    expect(openingSeatEvent((await syncView(observer)).snapshot)?.message).toBe('Seat 1 is taken by the creator.');
    observer.send({ type: 'history', step: 0 });
    expect(openingSeatEvent((await observer.message('history')).snapshot)?.message).toBe(
      'Seat 1 is taken by the creator.'
    );
    expect(JSON.stringify(await runtime.exec<{ data: string }>('SELECT data FROM history'))).not.toContain(
      'Synthetic B'
    );
    expect(await creator()).toEqual({ userId: 'user-a', displayName: '[deleted user]' });
  }

  it('keeps another actor with the same name separate and scrubs the creator in live views, history and cold restore', async () => {
    await prepareGame();
    await admitPlayer(runtime, 'b');
    const observer = await admitPlayer(runtime, 'c');
    await deleteAccount('user-b');
    expect(openingSeatEvent((await syncView(observer)).snapshot)?.message).toBe('Seat 1 is taken by the creator.');
    expect(await creator()).toEqual({ userId: 'user-a', displayName: 'Synthetic B' });

    await deleteAccount('user-a');
    await assertAnonymized(observer);
    await runtime.restart();
    await assertAnonymized(await admitPlayer(runtime, 'c'));
  });

  it('repairs an already-deleted creator in a room stamped by the previous scrub release', async () => {
    await prepareGame();
    /* The preceding release marked actors deleted but left the opening event named. */
    await runtime.exec("UPDATE actors SET deleted=1, seat='neutral', display_name='[deleted user]' WHERE user_id=?", [
      'user-a',
    ]);
    await runtime.exec("UPDATE metadata SET data=json_set(data, '$.historyRepair', 1)");
    await runtime.restart();
    await assertAnonymized(await admitPlayer(runtime, 'c'));
  });

  it('keeps the creator anonymous when a pending confirmation later saves metadata', async () => {
    peer.holdConfirmations = true;
    const pending = provision(runtime);
    const confirmation = await eventually(
      () => peer.requests.find((request) => request.function === 'playProvisioning:confirmProvisioning'),
      'pending confirmation'
    );
    const confirmationAlarm = (await runtime.alarm()).scheduledAt;
    await deleteAccount('user-a');
    expect.soft((await runtime.alarm()).scheduledAt).toBe(confirmationAlarm);
    expect.soft(peer.summaries).toEqual([]);
    expect.soft(await creator()).toEqual({ userId: 'user-a', displayName: '[deleted user]' });
    confirmation.release({ ok: true });
    expect((await pending).status).toBe(200);
    await eventually(() => peer.summaries.length === 1, 'confirmed directory summary');
    expect(peer.summaries[0]).toMatchObject({ sequence: 2, summary: { seats: [] } });
    await assertAnonymized(await admitPlayer(runtime, 'c'));
  });
});
