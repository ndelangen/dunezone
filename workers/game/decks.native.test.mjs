import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { admitPlayer, createPeer, createRuntime, provision, sendCommand, syncView } from './native-runtime.fixture.mjs';

describe('Private deck commands through native delivery', () => {
  let peer, runtime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The isolated fixture did not provision.');
    }
    const rows = await runtime.exec('SELECT data FROM current_state WHERE id=1');
    const snapshot = JSON.parse(rows[0].data);
    const deck = snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck');
    deck.items = deck.items.map((item, index) => ({
      ...item,
      artwork: {
        front: `https://cards.example/secret-${index}.png`,
        back: 'https://cards.example/back.png',
        name: `Secret ${index}`,
        type: 'card-treachery',
      },
    }));
    const loose = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    loose.items[0] = {
      ...loose.items[0],
      faceUp: true,
      artwork: { ...deck.items[0].artwork, front: 'https://cards.example/known.png' },
    };
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.exec('UPDATE history SET data=? WHERE step=0', [JSON.stringify(snapshot)]);
    await runtime.restart();
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const deck = (view) => view.snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck');

  it('deals one retained card directly to its recipient, deduplicates retries and restores private hands', async () => {
    const a = await admit('a'),
      b = await admit('b'),
      spectator = await admit('c');
    const before = await syncView(a);
    const oldHandles = deck(before).items.map((item) => item.id);
    const result = await sendCommand(a, { kind: 'deck-draw', pieceId: 'treachery-deck', recipient: 'atreides' });
    expect(result.reply.type).not.toBe('rejected');
    result.reply = await syncView(a);
    expect(deck(result.reply).items).toHaveLength(3);
    expect(result.reply.snapshot.hand).toHaveLength(0);
    const recipient = await syncView(b);
    expect(recipient.snapshot.hand).toHaveLength(1);
    expect(recipient.snapshot.hand[0].items[0].artwork.front).toBe('https://cards.example/secret-3.png');
    expect(oldHandles).not.toContain(recipient.snapshot.hand[0].items[0].id);
    a.send(result.message);
    expect((await syncView(b)).snapshot.hand).toHaveLength(1);
    expect(JSON.stringify(a.messages)).not.toContain('secret-3');
    expect(JSON.stringify(spectator.messages)).not.toContain('secret-3');
    await runtime.restart();
    expect((await syncView(await admit('b'))).snapshot.hand).toHaveLength(1);
    const rows = await runtime.exec('SELECT action FROM public_action_history');
    expect(rows).toHaveLength(1);
  });

  it('retires every public card handle on shuffle while preserving internal identities across retry and restart', async () => {
    const a = await admit('a');
    await admit('b');
    const spectator = await admit('c');
    const original = await syncView(a);
    const originalStored = JSON.parse((await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0].data);
    const first = await sendCommand(a, { kind: 'deck-shuffle', pieceId: 'treachery-deck' });
    expect(first.reply.type).not.toBe('rejected');
    first.reply = await syncView(a);
    expect(deck(first.reply).items.every((item) => !item.faceUp && !item.artwork.front)).toBe(true);
    const old = deck(original).items.map((item) => item.id);
    expect(deck(first.reply).items.every((item) => !old.includes(item.id))).toBe(true);
    const stored = JSON.parse((await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0].data);
    expect(
      deck({ snapshot: stored })
        .items.map((item) => item.id)
        .sort()
    ).toEqual(
      deck({ snapshot: originalStored })
        .items.map((item) => item.id)
        .sort()
    );
    a.send(first.message);
    expect(deck(await syncView(a))).toEqual(deck(first.reply));
    await runtime.restart();
    expect(deck(await syncView(await admit('a')))).toEqual(deck(first.reply));
    expect(JSON.stringify(spectator.messages)).not.toContain('secret-');
    expect(JSON.stringify(first.reply)).not.toContain('cardHandles');
  });

  it('rejects spectators and reserved decks, and exposes only backs when a dealt card returns to the table', async () => {
    const a = await admit('a');
    await admit('b');
    const spectator = await admit('c');
    expect((await sendCommand(spectator, { kind: 'deck-draw', pieceId: 'treachery-deck' })).reply.type).toBe(
      'rejected'
    );
    await sendCommand(a, { kind: 'deck-draw', pieceId: 'treachery-deck' });
    const hand = (await syncView(a)).snapshot.hand[0];
    const result = await sendCommand(a, { kind: 'hand-play', pieceId: hand.id, position: [0, 0.4, 0] });
    expect(result.reply.type).not.toBe('rejected');
    result.reply = await syncView(a);
    const returned = (await syncView(spectator)).snapshot.table.pieces.find(
      (piece) => piece.position[0] === 0 && piece.kind === 'card'
    );
    expect(returned.id).not.toBe(hand.id);
    expect((await sendCommand(a, { kind: 'flip', pieceId: hand.id })).reply.type).toBe('rejected');
    expect((await sendCommand(a, { kind: 'flip', pieceId: returned.id })).reply.type).not.toBe('rejected');
    expect(returned.items[0].faceUp).toBe(false);
    expect(returned.items[0].artwork).not.toHaveProperty('front');
    expect(returned.items[0].id).not.toBe(hand.items[0].id);
    const view = await syncView(a);
    a.send({
      type: 'begin',
      carryId: 'held-deck',
      sourcePieceId: 'treachery-deck',
      expectedVersion: view.snapshot.versions['treachery-deck'],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'held-deck');
    expect((await sendCommand(a, { kind: 'deck-shuffle', pieceId: 'treachery-deck' })).reply.type).toBe('rejected');
  });
  it('keeps old battle reveals separate from shuffled card handles and combines decks with a shared back', async () => {
    const state = JSON.parse((await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0].data);
    const source = state.table.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    loose.stackKey = 'another-faction-traitors';
    loose.position = [4.15, 0.3, -0.5];
    loose.items[0].artwork = { ...source.items[0].artwork };
    const plan = {
      mode: 'max',
      troops: [],
      spice: 0,
      adjustment: 0,
      leaderId: null,
      cardIds: ['old-reveal'],
      strength: 0,
      faces: [],
      pieces: [{ ...source, id: 'old-reveal', items: [source.items[0]] }],
    };
    state.battleState = {
      id: 'active-battle',
      anchor: [0, 0, 0],
      territory: 'Arrakeen',
      stage: 'revealed',
      deadline: null,
      sides: [
        { factionId: 'harkonnen', ready: true, choice: null },
        { factionId: 'atreides', ready: true, choice: null },
      ],
      plans: [plan, { ...plan, cardIds: [], pieces: [] }],
    };
    state.battleResults = [
      {
        id: 'past-battle',
        anchor: [0, 0, 0],
        territory: 'Arrakeen',
        factions: ['harkonnen', 'atreides'],
        plans: [plan, { ...plan, cardIds: [], pieces: [] }],
        outcome: 'none',
        revision: 0,
      },
    ];
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(state)]);
    await runtime.restart();
    const a = await admit('a');
    const before = await syncView(a);
    const revealed = before.snapshot.battleResults[0].plans[0].pieces[0].items[0];
    expect(revealed.artwork.front).toBe('https://cards.example/secret-0.png');
    expect(deck(before).items.map((item) => item.id)).not.toContain(revealed.id);
    expect((await sendCommand(a, { kind: 'stack', pieceId: 'treachery-card-loose' })).reply.type).not.toBe('rejected');
    const combined = (await syncView(a)).snapshot.table.pieces.find((piece) => piece.kind === 'card');
    expect(combined.items).toHaveLength(5);
    await sendCommand(a, { kind: 'deck-shuffle', pieceId: combined.id });
    const shuffled = await syncView(a);
    expect(
      shuffled.snapshot.table.pieces.find((piece) => piece.id === combined.id).items.map((item) => item.id)
    ).not.toContain(revealed.id);
    expect(shuffled.snapshot.battleResults[0].plans[0].pieces[0].items[0]).toEqual(revealed);
    for (const saved of [shuffled.snapshot.battle.revealed[0], shuffled.snapshot.battlePlan]) {
      const publicIds = shuffled.snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id));
      expect(publicIds).not.toContain(saved.pieces[0].items[0].id);
      expect(saved.pieces[0].items[0].artwork.front).toBe(revealed.artwork.front);
    }
  });

  it('conceals a known piece across hand return and accepts only its current handle after reconnect', async () => {
    const a = await admit('a');
    await admit('b');
    const spectator = await admit('c');
    const knownId = 'treachery-card-loose';
    const before = await syncView(a);
    const known = before.snapshot.table.pieces.find((piece) => piece.id === knownId);
    await sendCommand(a, { kind: 'hand-take', pieceId: knownId });
    const hand = (await syncView(a)).snapshot.hand[0];
    expect(hand.id).not.toBe(knownId);
    const played = await sendCommand(a, { kind: 'hand-play', pieceId: hand.id, position: [0, 0.4, 0] });
    const view = await syncView(spectator);
    const returned = view.snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1);
    expect(returned.id).not.toBe(knownId);
    expect(returned.id).not.toBe(hand.id);
    expect(returned.items[0].id).not.toBe(known.items[0].id);
    expect(returned.items[0].artwork).not.toHaveProperty('front');
    expect(view.snapshot.versions).not.toHaveProperty(knownId);
    expect(view.snapshot.versions).toHaveProperty(returned.id);
    a.send(played.message);
    expect((await syncView(a)).snapshot.revision).toBe(view.snapshot.revision);
    await runtime.restart();
    const restored = await admit('a');
    expect((await sendCommand(restored, { kind: 'hand-take', pieceId: knownId })).reply.type).toBe('rejected');
    restored.send({
      type: 'begin',
      carryId: 'concealed-carry',
      sourcePieceId: returned.id,
      expectedVersion: view.snapshot.versions[returned.id],
      pickup: 'whole',
    });
    const carry = await restored.message('carry', (message) => message.carryId === 'concealed-carry');
    expect(carry.draft.sourcePieceId).toBe(returned.id);
    expect(carry.draft.pieceId).toBe(returned.id);
    expect(carry.draft.pickedUpItemIds).toEqual(returned.items.map((item) => item.id));
    const stored = JSON.parse((await runtime.exec('SELECT data FROM current_state WHERE id=1'))[0].data);
    expect(stored.table.pieces.some((piece) => piece.id === knownId)).toBe(true);
  });

  it('serializes repeated draw clicks without losing a click to an older view', async () => {
    const a = await admit('a');
    const before = await syncView(a);
    const first = await sendCommand(
      a,
      { kind: 'deck-draw', pieceId: 'treachery-deck' },
      'first-click',
      before.snapshot.revision
    );
    const second = await sendCommand(
      a,
      { kind: 'deck-draw', pieceId: 'treachery-deck' },
      'second-click',
      before.snapshot.revision
    );
    expect(first.reply.type).not.toBe('rejected');
    expect(second.reply.type).not.toBe('rejected');
    const after = await syncView(a);
    expect(after.snapshot.hand).toHaveLength(2);
    expect(new Set(after.snapshot.hand.map((piece) => piece.items[0].id)).size).toBe(2);
    expect(deck(after).items).toHaveLength(2);
  });
});
