import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { draftingRuntime } from './native-drafting.fixture.mjs';
import { accepted, admitPlayer, eventually, seat, syncView } from './native-runtime.fixture.mjs';

describe('Faction conversations in the game database', () => {
  let peer, runtime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime());
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  async function setup() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    for (const player of [a, b]) {
      await accepted(player, { kind: 'draft-ready', ready: true });
    }
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    for (const player of [a, b]) {
      const view = await syncView(player);
      await accepted(player, {
        kind: 'swap-ready',
        ready: true,
        round: view.snapshot.swapping.round,
        seat: view.viewer.viewerSeat,
      });
    }
    a.send({ type: 'sync', conversations: true });
    b.send({ type: 'sync', conversations: true });
    const view = await syncView(a);
    expect(view.snapshot.stage).toBe('setup');
    const faction = (playerView) =>
      playerView.snapshot.roster.seats.find((entry) => entry.id === playerView.viewer.viewerSeat).faction.id;
    return { a, b, aId: faction(view), bId: faction(await syncView(b)) };
  }
  async function request(player, message) {
    const offset = player.messages.length;
    const requestId = message.requestId ?? randomUUID();
    player.send({ ...message, requestId });
    return eventually(
      () =>
        player.messages
          .slice(offset)
          .find((entry) => entry.requestId === requestId || entry.message?.requestId === requestId),
      'conversation response'
    );
  }
  const page = (player, factionId, peerId, before = Number.MAX_SAFE_INTEGER) =>
    request(player, { type: 'conversation-history', factionId, peerId, before });
  const send = (player, factionId, peerId, text = 'Private plans', requestId) =>
    request(player, { type: 'conversation-send', factionId, peerId, text, requestId });

  it('opens at setup, saves once, retains every page through visits and cold restore, and stays out of public deliveries', async () => {
    const drafting = await admit('a');
    expect((await send(drafting, 'atreides', 'harkonnen')).type).toBe('rejected');
    const { a, b, aId, bId } = await setup();
    const observer = await admit('observer');
    const oldClient = await admit('a');
    const first = await send(a, aId, bId, 'Private plans', 'one-message');
    expect(first.type).toBe('conversation-message');
    expect((await send(a, aId, bId, 'Private plans', 'one-message')).message).toEqual(first.message);
    expect((await send(a, aId, bId, 'Changed plans', 'one-message')).type).toBe('rejected');
    for (let index = 0; index < 53; index++) {
      await send(a, aId, bId, `Retained ${index}`);
    }
    const recent = await page(b, bId, aId);
    expect(recent.entries).toHaveLength(50);
    expect(recent.more).toBe(true);
    const earlier = await page(b, bId, aId, recent.entries[0].sequence);
    expect(earlier.entries).toHaveLength(4);
    expect(earlier.more).toBe(false);
    expect(earlier.entries[0]).toEqual(first.message);
    expect(JSON.stringify(await syncView(b))).not.toContain('Private plans');
    expect(oldClient.messages.filter((entry) => entry.type.startsWith('conversation'))).toEqual([]);
    expect(observer.messages.filter((entry) => entry.type.startsWith('conversation'))).toEqual([]);
    expect((await page(observer, aId, bId)).type).toBe('rejected');
    expect((await page(a, bId, aId)).type).toBe('rejected');
    expect((await page(a, aId, 'guessed-faction')).type).toBe('rejected');
    expect(JSON.stringify(await runtime.exec('SELECT data FROM history'))).not.toContain('Private plans');
    expect(JSON.stringify(await runtime.exec('SELECT data FROM current_state'))).not.toContain('Private plans');
    await runtime.restart();
    expect((await page(await admit('b'), bId, aId)).entries).toEqual(recent.entries);
    expect((await page(await admit('b'), bId, aId, recent.entries[0].sequence)).entries).toEqual(earlier.entries);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM conversation_messages')).toEqual([{ count: 54 }]);
  });

  it('revokes former owners before retry lookup and gives replacements the full faction conversation', async () => {
    const { a, b, aId, bId } = await setup();
    const saved = await send(b, bId, aId, 'Inherited message', 'old-owner');
    const oldSeat = (await syncView(b)).viewer.viewerSeat;
    await accepted(b, { kind: 'seat-depart' });
    expect((await send(b, bId, aId, 'Inherited message', 'old-owner')).type).toBe('rejected');
    expect((await page(b, bId, aId)).type).toBe('rejected');
    const c = await admit('c');
    await seat(c, a, oldSeat);
    expect((await page(c, bId, aId)).entries).toEqual([saved.message]);
    const offset = b.messages.length;
    await send(a, aId, bId, 'Only the replacement sees this');
    await syncView(b);
    expect(JSON.stringify(b.messages.slice(offset))).not.toContain('Only the replacement sees this');
    await send(c, bId, aId, 'A new owner may use its own receipt', 'old-owner');
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM conversation_messages')).toEqual([{ count: 3 }]);
  });

  it('keeps unread until an endpoint marks a saved position, without exposing a recipient read receipt', async () => {
    const { a, b, aId, bId } = await setup();
    const first = await send(a, aId, bId);
    await page(b, bId, aId);
    await syncView(b);
    expect(
      b.messages
        .filter((entry) => entry.type === 'conversations')
        .at(-1)
        .entries.find((entry) => entry.peerId === aId).unread
    ).toBe(1);
    const offset = a.messages.length;
    b.send({
      type: 'conversation-read',
      requestId: 'read-one',
      factionId: bId,
      peerId: aId,
      through: first.message.sequence,
    });
    await syncView(b);
    expect(
      b.messages
        .filter((entry) => entry.type === 'conversations')
        .at(-1)
        .entries.find((entry) => entry.peerId === aId).unread
    ).toBe(0);
    expect(a.messages.slice(offset).filter((entry) => entry.type.startsWith('conversation'))).toEqual([]);
    expect((await request(b, { type: 'conversation-read', factionId: bId, peerId: aId, through: 999_999 })).type).toBe(
      'rejected'
    );
  });

  it('rolls failed saves back and redacts deleted authors in retained messages before restore', async () => {
    const { a, b, aId, bId } = await setup();
    await runtime.exec(
      "CREATE TRIGGER refuse_message BEFORE INSERT ON conversation_messages BEGIN SELECT RAISE(ABORT,'save failure'); END"
    );
    expect((await send(a, aId, bId, 'Retryable', 'retry')).type).toBe('rejected');
    expect((await page(b, bId, aId)).entries).toEqual([]);
    await runtime.exec('DROP TRIGGER refuse_message');
    await send(a, aId, bId, 'Retryable', 'retry');
    expect(
      (
        await runtime.fetch('/__play/games/fixture-game/account-deletion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: 'fixture-game',
            secret: 'a'.repeat(64),
            userId: 'user-a',
            eventId: 'delete-a',
            deletionOperationId: 'operation-a',
          }),
        })
      ).status
    ).toBe(200);
    const retained = await page(b, bId, aId);
    expect(retained.entries[0].author).toBe('[deleted user]');
    expect(JSON.stringify(await runtime.exec('SELECT * FROM conversation_messages'))).not.toMatch(/Synthetic A|user-a/);
    await runtime.restart();
    expect((await page(await admit('b'), bId, aId)).entries).toEqual(retained.entries);
  });
});
