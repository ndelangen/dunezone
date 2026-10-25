import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { TablePiece } from '../../src/shared/play/model';
import type { GameSnapshot } from '../../src/shared/play/protocol';
import { readSnapshot } from './native-runtime.fixture.ts';
import { readHistoricalSnapshot } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { admitPlayer, createPeer, createRuntime, provision, sendCommand, syncView } from './native-runtime.fixture.ts';

/* Every card face in the game reaches every page by design, as a sorted list that ties no face to a card; the rest of a frame must not. */
const shown = (value: unknown) =>
  JSON.stringify(value, (key: string, entry: unknown) => (key === 'cardFaces' ? undefined : entry));

describe('Private deck commands through native delivery', () => {
  let peer: NativePeer, runtime: NativeRuntime;
  beforeEach(async () => {
    peer = await createPeer();
    peer.watchMode = 'allow';
    peer.expiresAt = () => Date.now() + 600_000;
    runtime = await createRuntime(peer, 'game');
    if ((await provision(runtime)).status !== 200) {
      throw new Error('The isolated fixture did not provision.');
    }
    const rows = await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1');
    const snapshot = readSnapshot(rows[0].data);
    const deck = snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck');
    required(deck).items = required(deck).items.map((item, index: number) => ({
      ...item,
      artwork: {
        front: `https://cards.example/secret-${index}.png`,
        back: 'https://cards.example/back.png',
        name: `Secret ${index}`,
        type: 'card-treachery' as const,
      },
    }));
    const loose = snapshot.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    required(loose).items[0] = {
      ...required(loose).items[0],
      faceUp: true,
      artwork: { ...required(required(deck).items[0].artwork), front: 'https://cards.example/known.png' },
    };
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(snapshot)]);
    await runtime.exec('UPDATE history SET data=? WHERE step=0', [JSON.stringify(snapshot)]);
    await runtime.restart();
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix: string) => admitPlayer(peer, runtime, suffix);
  const deck = (view: { snapshot: { table: GameSnapshot['table'] } }) =>
    view.snapshot.table.pieces.find((piece) => piece.id === 'treachery-deck');

  it('deals one retained card directly to its recipient, deduplicates retries and restores private hands', async () => {
    const a = await admit('a'),
      b = await admit('b'),
      spectator = await admit('c');
    const before = await syncView(a);
    const oldHandles = required(deck(before)).items.map((item) => item.id);
    const result = await sendCommand(a, {
      kind: 'deck-draw' as const,
      pieceId: 'treachery-deck',
      recipient: 'atreides',
    });
    expect(result.reply.type).not.toBe('rejected');
    result.reply = await syncView(a);
    expect(required(deck(result.reply)).items).toHaveLength(3);
    expect(result.reply.snapshot.hand).toHaveLength(0);
    const recipient = await syncView(b);
    expect(recipient.snapshot.hand).toHaveLength(1);
    expect(required(required(recipient.snapshot.hand)[0].items[0].artwork).front).toBe(
      'https://cards.example/secret-3.png'
    );
    expect(oldHandles).not.toContain(required(recipient.snapshot.hand)[0].items[0].id);
    a.send(result.message);
    expect((await syncView(b)).snapshot.hand).toHaveLength(1);
    /* A view each socket asks for now arrives behind anything the draw or its retry sent to that socket. */
    await syncView(a);
    await syncView(spectator);
    expect(shown(a.messages)).not.toContain('secret-3');
    expect(shown(spectator.messages)).not.toContain('secret-3');
    await runtime.restart();
    expect((await syncView(await admit('b'))).snapshot.hand).toHaveLength(1);
    const rows = await runtime.exec<{ action: string }>('SELECT action FROM public_action_history');
    expect(rows).toHaveLength(1);
  });

  it('retires every public card handle on shuffle while preserving internal identities across retry and restart', async () => {
    const a = await admit('a');
    await admit('b');
    const spectator = await admit('c');
    const original = await syncView(a);
    const originalStored = readSnapshot(
      (await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1'))[0].data
    );
    const first = await sendCommand(a, { kind: 'deck-shuffle' as const, pieceId: 'treachery-deck' });
    expect(first.reply.type).not.toBe('rejected');
    first.reply = await syncView(a);
    expect(required(deck(first.reply)).items.every((item) => !item.faceUp && !required(item.artwork).front)).toBe(true);
    const old = required(deck(original)).items.map((item) => item.id);
    expect(required(deck(first.reply)).items.every((item) => !old.includes(item.id))).toBe(true);
    const stored = readSnapshot(
      (await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1'))[0].data
    );
    expect(
      required(deck({ snapshot: stored }))
        .items.map((item) => item.id)
        .sort()
    ).toEqual(
      required(deck({ snapshot: originalStored }))
        .items.map((item) => item.id)
        .sort()
    );
    a.send(first.message);
    expect(deck(await syncView(a))).toEqual(deck(first.reply));
    await runtime.restart();
    expect(deck(await syncView(await admit('a')))).toEqual(deck(first.reply));
    expect(shown(spectator.messages)).not.toContain('secret-');
    expect(JSON.stringify(first.reply)).not.toContain('cardHandles');
  });

  it('rejects spectators and reserved decks, and exposes only backs when a dealt card returns to the table', async () => {
    const a = await admit('a');
    await admit('b');
    const spectator = await admit('c');
    expect((await sendCommand(spectator, { kind: 'deck-draw' as const, pieceId: 'treachery-deck' })).reply.type).toBe(
      'rejected'
    );
    await sendCommand(a, { kind: 'deck-draw' as const, pieceId: 'treachery-deck' });
    const hand = required((await syncView(a)).snapshot.hand)[0];
    const result = await sendCommand(a, { kind: 'hand-play' as const, pieceId: hand.id, position: [0, 0.4, 0] });
    expect(result.reply.type).not.toBe('rejected');
    result.reply = await syncView(a);
    const returned = (await syncView(spectator)).snapshot.table.pieces.find(
      (piece) => piece.position[0] === 0 && piece.kind === 'card'
    );
    expect(required(returned).id).not.toBe(hand.id);
    expect((await sendCommand(a, { kind: 'flip' as const, pieceId: hand.id })).reply.type).toBe('rejected');
    expect((await sendCommand(a, { kind: 'flip' as const, pieceId: required(returned).id })).reply.type).not.toBe(
      'rejected'
    );
    expect(required(returned).items[0].faceUp).toBe(false);
    expect(required(returned).items[0].artwork).not.toHaveProperty('front');
    expect(required(returned).items[0].id).not.toBe(hand.items[0].id);
    const view = await syncView(a);
    a.send({
      type: 'begin' as const,
      carryId: 'held-deck',
      sourcePieceId: 'treachery-deck',
      expectedVersion: view.snapshot.versions['treachery-deck'],
      pickup: 'whole',
    });
    await a.message('carry', (message) => message.carryId === 'held-deck');
    expect((await sendCommand(a, { kind: 'deck-shuffle' as const, pieceId: 'treachery-deck' })).reply.type).toBe(
      'rejected'
    );
  });
  async function seedMatchingBacksWithBattleReveals(stackKey: TablePiece['stackKey']) {
    const state = readHistoricalSnapshot(
      (await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1'))[0].data
    );
    const source = state.table.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    required(loose).stackKey = stackKey;
    required(loose).position = [4.15, 0.3, -0.5];
    required(loose).items[0].artwork = { ...required(required(source).items[0].artwork) };
    const plan = {
      mode: 'max' as const,
      troops: [],
      spice: 0,
      adjustment: 0,
      leaderIds: [],
      cardIds: ['old-reveal'],
      strength: 0,
      faces: [],
      pieces: [{ ...required(source), id: 'old-reveal', items: [required(source).items[0]] }],
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
  }

  it.each(['another-faction-traitors', null])(
    'keeps battle reveals separate and combines matching backs with stack key %s',
    async (stackKey) => {
      await seedMatchingBacksWithBattleReveals(stackKey);
      const a = await admit('a');
      const before = await syncView(a);
      const revealed = required(before.snapshot.battleResults)[0].plans[0].pieces[0].items[0];
      expect(required(revealed.artwork).front).toBe('https://cards.example/secret-0.png');
      expect(required(deck(before)).items.map((item) => item.id)).not.toContain(revealed.id);
      expect((await sendCommand(a, { kind: 'stack' as const, pieceId: 'treachery-card-loose' })).reply.type).not.toBe(
        'rejected'
      );
      const combined = (await syncView(a)).snapshot.table.pieces.find((piece) => piece.kind === 'card');
      expect(required(combined).items).toHaveLength(5);
      await sendCommand(a, { kind: 'deck-shuffle' as const, pieceId: required(combined).id });
      const shuffled = await syncView(a);
      expect(
        required(shuffled.snapshot.table.pieces.find((piece) => piece.id === required(combined).id)).items.map(
          (item) => item.id
        )
      ).not.toContain(revealed.id);
      expect(required(shuffled.snapshot.battleResults)[0].plans[0].pieces[0].items[0]).toEqual(revealed);
      for (const saved of [required(required(shuffled.snapshot.battle).revealed)[0], shuffled.snapshot.battlePlan]) {
        const publicIds = shuffled.snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id));
        expect(publicIds).not.toContain(required(saved).pieces[0].items[0].id);
        expect(required(required(saved).pieces[0].items[0].artwork).front).toBe(required(revealed.artwork).front);
      }
    }
  );

  async function seedRevealedCard() {
    const state = readHistoricalSnapshot(
      (await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1'))[0].data
    );
    const source = state.table.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.table.pieces.find((piece) => piece.id === 'treachery-card-loose');
    required(loose).position = [4.15, 0.3, -0.5];
    required(required(loose).items[0].artwork).back = required(required(source).items[0].artwork).back;
    required(loose).battleOverlay = 'active-battle';
    const plan = {
      mode: 'max' as const,
      troops: [],
      spice: 0,
      adjustment: 0,
      leaderIds: [],
      cardIds: [required(loose).id],
      strength: 0,
      faces: [],
      pieces: [structuredClone(required(loose))],
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
    await runtime.exec('UPDATE current_state SET data=? WHERE id=1', [JSON.stringify(state)]);
    await runtime.restart();
    return { source, loose };
  }

  it('stops a revealed card control from targeting a deck merged onto that card', async () => {
    const { source, loose } = await seedRevealedCard();
    const a = await admit('a');
    expect(required(required((await syncView(a)).snapshot.battle).revealed)[0].pieces[0].id).toBe(required(loose).id);
    expect((await sendCommand(a, { kind: 'stack' as const, pieceId: required(source).id })).reply.type).not.toBe(
      'rejected'
    );
    const merged = await syncView(a);
    expect(required(merged.snapshot.table.pieces.find((piece) => piece.id === required(loose).id)).items).toHaveLength(
      5
    );
    expect(
      required(merged.snapshot.table.pieces.find((piece) => piece.id === required(loose).id)).battleOverlay
    ).toBeUndefined();
    expect(required(required(merged.snapshot.battle).revealed)[0].pieces[0].id).not.toBe(required(loose).id);
    await sendCommand(a, { kind: 'deck-shuffle' as const, pieceId: required(loose).id });
    const shuffled = await syncView(a);
    expect(required(required(shuffled.snapshot.battle).revealed)[0].pieces[0].id).not.toBe(required(loose).id);
    expect(required(shuffled.snapshot.battlePlan).pieces[0].id).not.toBe(required(loose).id);
    expect(
      required(shuffled.snapshot.table.pieces.find((piece) => piece.id === required(loose).id)).items.map(
        (item) => item.id
      )
    ).not.toContain(required(required(shuffled.snapshot.battle).revealed)[0].pieces[0].items[0].id);
  });

  it('puts a revealed card back on the table when it is flipped face down', async () => {
    const { loose } = await seedRevealedCard();
    const a = await admit('a');
    expect((await sendCommand(a, { kind: 'flip' as const, pieceId: required(loose).id })).reply.type).not.toBe(
      'rejected'
    );
    const view = await syncView(a);
    const card = view.snapshot.table.pieces.find((piece) => piece.id === required(loose).id);
    expect(required(card).battleOverlay).toBeUndefined();
    expect(required(card).items[0].faceUp).toBe(false);
    expect(required(card).items[0].artwork).not.toHaveProperty('front');
    expect(required(required(view.snapshot.battle).revealed)[0].pieces[0].id).not.toBe(required(loose).id);
    expect(required(required(required(view.snapshot.battle).revealed)[0].pieces[0].items[0].artwork).front).toBe(
      required(required(loose).items[0].artwork).front
    );
  });

  it('conceals a known piece across hand return and accepts only its current handle after reconnect', async () => {
    const a = await admit('a');
    await admit('b');
    const spectator = await admit('c');
    const knownId = 'treachery-card-loose';
    const before = await syncView(a);
    const known = before.snapshot.table.pieces.find((piece) => piece.id === knownId);
    await sendCommand(a, { kind: 'hand-take' as const, pieceId: knownId });
    const hand = required((await syncView(a)).snapshot.hand)[0];
    expect(hand.id).not.toBe(knownId);
    const played = await sendCommand(a, { kind: 'hand-play' as const, pieceId: hand.id, position: [0, 0.4, 0] });
    const view = await syncView(spectator);
    const returned = view.snapshot.table.pieces.find((piece) => piece.kind === 'card' && piece.items.length === 1);
    expect(required(returned).id).not.toBe(knownId);
    expect(required(returned).id).not.toBe(hand.id);
    expect(required(returned).items[0].id).not.toBe(required(known).items[0].id);
    expect(required(returned).items[0].artwork).not.toHaveProperty('front');
    expect(view.snapshot.versions).not.toHaveProperty(knownId);
    expect(view.snapshot.versions).toHaveProperty(required(returned).id);
    a.send(played.message);
    expect((await syncView(a)).snapshot.revision).toBe(view.snapshot.revision);
    await runtime.restart();
    const restored = await admit('a');
    expect((await sendCommand(restored, { kind: 'hand-take' as const, pieceId: knownId })).reply.type).toBe('rejected');
    restored.send({
      type: 'begin' as const,
      carryId: 'concealed-carry',
      sourcePieceId: required(returned).id,
      expectedVersion: view.snapshot.versions[required(returned).id],
      pickup: 'whole',
    });
    const carry = await restored.message('carry', (message) => message.carryId === 'concealed-carry');
    expect(carry.draft.sourcePieceId).toBe(required(returned).id);
    expect(carry.draft.pieceId).toBe(required(returned).id);
    expect(carry.draft.pickedUpItemIds).toEqual(required(returned).items.map((item) => item.id));
    const stored = readSnapshot(
      (await runtime.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1'))[0].data
    );
    expect(stored.table.pieces.some((piece) => piece.id === knownId)).toBe(true);
  });

  it('serializes repeated draw clicks without losing a click to an older view', async () => {
    const a = await admit('a');
    const before = await syncView(a);
    const first = await sendCommand(
      a,
      { kind: 'deck-draw' as const, pieceId: 'treachery-deck' },
      'first-click',
      before.snapshot.revision
    );
    const second = await sendCommand(
      a,
      { kind: 'deck-draw' as const, pieceId: 'treachery-deck' },
      'second-click',
      before.snapshot.revision
    );
    expect(first.reply.type).not.toBe('rejected');
    expect(second.reply.type).not.toBe('rejected');
    const after = await syncView(a);
    expect(after.snapshot.hand).toHaveLength(2);
    expect(new Set(required(after.snapshot.hand).map((piece) => piece.items[0].id)).size).toBe(2);
    expect(required(deck(after)).items).toHaveLength(2);
  });
});
