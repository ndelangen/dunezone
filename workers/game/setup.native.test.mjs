import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { piecesCanStack } from '../../src/shared/play/tablePhysics';
import { cardPage, tokenPage } from './native-catalogue.fixture.mjs';
import { dealt, draftingRuntime } from './native-drafting.fixture.mjs';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.mjs';

async function ready(connection, commandId) {
  const view = await syncView(connection);
  const message = {
    type: 'command',
    commandId,
    expectedRevision: view.snapshot.revision,
    action: { kind: 'swap-ready', ready: true, round: view.snapshot.swapping.round, seat: view.viewer.viewerSeat },
  };
  connection.socket.send(JSON.stringify(message));
  await eventually(
    () => connection.messages.some((entry) => entry.completedCommandId === commandId),
    'readiness committed'
  );
  return message;
}

describe('Retained supply at setup entry', () => {
  let peer, runtime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime(
      [],
      Array.from({ length: 12 }, (_, index) => cardPage(`card-${index}`))
    ));
    const extra = tokenPage('shared-extra');
    peer.catalogue.set('token-disc/shared-extra', extra);
    /* Both factions declare the same Extra; each must get its own copy. */
    for (const id of ['atreides', 'harkonnen']) {
      const entry = peer.factions.get(id);
      peer.factions.set(id, {
        ...entry,
        data: { ...entry.data, extras: [{ type: 'token-disc', slug: 'shared-extra' }] },
      });
      await runtime.capture('faction', id, { provisional: true });
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  const stored = async () => JSON.parse((await runtime.exec('SELECT data FROM current_state'))[0].data);

  it('supplies retained pieces and starting spice once despite source deletion, command replay and cold restore', async () => {
    const [a, b] = await dealt(peer, runtime);
    const captures = await runtime.captures();
    peer.catalogue.clear();
    peer.factions.clear();
    peer.rulesets.clear();
    await ready(a, 'ready-a');
    const last = await ready(b, 'ready-b');
    const first = await syncView(b);
    expect(first.snapshot.stage).toBe('setup');
    expect(first.snapshot.bank.balance).toBeGreaterThan(0);
    const initial = await stored();
    const treachery = initial.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck');
    expect(new Set(treachery.items.map((item) => item.artwork.front)).size).toBe(12);
    const publicDeck = first.snapshot.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck');
    expect(publicDeck.items.every((item) => !item.faceUp && !item.artwork.front && !item.artwork.name)).toBe(true);
    const decks = initial.table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(decks).toHaveLength(2);
    expect(decks.every((deck) => deck.items.every((item) => !item.faceUp))).toBe(true);
    expect(decks.map((deck) => deck.label)).toEqual(['Traitor cards', 'Traitor cards']);
    const extras = Object.values(initial.factionInventories)
      .flat()
      .filter((piece) => piece.label === 'shared-extra');
    expect(extras).toHaveLength(2);
    expect(new Set(extras.map((piece) => piece.id)).size).toBe(2);
    expect(new Set(extras.flatMap((piece) => piece.items.map((item) => item.id))).size).toBe(2);
    for (const capture of captures.factions) {
      const faction = capture.faction.id;
      expect(initial.factionBanks[faction]).toBe(capture.definition.rules.spiceCount);
      expect(
        initial.table.pieces
          .filter((piece) => piece.owner === faction)
          .reduce((sum, piece) => sum + piece.items.length, 0)
      ).toBe(capture.components.troops.reduce((sum, troop) => sum + troop.count, 0));
      expect(initial.factionInventories[faction].map((piece) => piece.label)).toEqual([
        ...capture.components.leaders.map((leader) => leader.name),
        'shared-extra',
      ]);
      expect(initial.table.pieces.filter((piece) => piece.owner === faction).map((piece) => piece.label)).toEqual(
        capture.components.troops.map((troop) => troop.name)
      );
    }
    b.socket.send(JSON.stringify(last));
    await syncView(b);
    expect(await stored()).toEqual(initial);
    await runtime.restart();
    const restored = await syncView(await admit('b'));
    expect(restored.snapshot.bank).toEqual(first.snapshot.bank);
    expect(restored.snapshot.hand).toEqual(first.snapshot.hand);
    expect(await stored()).toEqual(initial);
    const active = await admit('b');
    await accepted(active, { kind: 'deck-draw', pieceId: publicDeck.id });
    const drawn = await syncView(active);
    expect(drawn.snapshot.hand).toHaveLength(first.snapshot.hand.length + 1);
    expect(drawn.snapshot.hand.at(-1).items[0].artwork.front).toBe(treachery.items.at(-1).artwork.front);
    const outsider = await syncView(await admit('observer'));
    expect(outsider.snapshot.hand).toBeUndefined();
    expect(JSON.stringify(outsider.snapshot)).not.toContain(treachery.items.at(-1).artwork.front);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 1 }]);
  });

  it('waits for the last replacement, preserves faction privacy and keeps progression gated', async () => {
    const [, b] = await dealt(peer, runtime);
    const old = await syncView(b);
    await accepted(b, { kind: 'seat-depart' });
    await runtime.offline("UPDATE current_state SET data=json_set(data,'$.swapping.deadline',1)");
    const restored = await admit('a');
    expect((await syncView(restored)).snapshot.stage).toBe('swapping');
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 0 }]);
    const c = await admit('c');
    await seat(c, restored, old.viewer.viewerSeat);
    const supplied = await syncView(c);
    expect(supplied.snapshot.stage).toBe('setup');
    const spectator = await syncView(await admit('b'));
    expect(spectator.snapshot.bank).toBeUndefined();
    expect(spectator.snapshot.hand).toBeUndefined();
    for (const action of [{ kind: 'phase' }, { kind: 'turn', turn: 2 }, { kind: 'reset' }]) {
      expect((await sendCommand(c, action)).reply.type).toBe('rejected');
    }
    const balance = supplied.snapshot.bank.balance;
    await accepted(c, { kind: 'bank-withdraw', amount: 1 });
    const spent = await syncView(c);
    expect(spent.snapshot.bank.balance).toBe(balance - 1);
    await accepted(c, { kind: 'seat-depart' });
    const replacement = await admit('d');
    await seat(replacement, restored, old.viewer.viewerSeat);
    const inherited = await syncView(replacement);
    expect(inherited.snapshot.bank).toEqual(spent.snapshot.bank);
    expect(inherited.snapshot.hand).toEqual(spent.snapshot.hand);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 1 }]);
  });

  it('rolls supply and its receipt back with the final readiness command', async () => {
    const [a, b] = await dealt(peer, runtime);
    await ready(a, 'first-ready');
    const before = await stored();
    await runtime.exec(
      "CREATE TRIGGER refuse_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END"
    );
    const view = await syncView(b);
    const result = await sendCommand(b, {
      kind: 'swap-ready',
      ready: true,
      round: view.snapshot.swapping.round,
      seat: view.viewer.viewerSeat,
    });
    expect(result.reply.type).toBe('rejected');
    expect(await stored()).toEqual(before);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 0 }]);
    await runtime.exec('DROP TRIGGER refuse_receipt');
    await ready(b, 'final-ready');
    expect((await syncView(b)).snapshot.stage).toBe('setup');
  });
});

describe('Traitor backs at setup entry', () => {
  let peer, runtime;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  /* Deals a two-player game whose factions the catalogue serves with these Traitor backs, readies the first player and sends the second player's final readiness. */
  async function enterSetup(atreides, harkonnen) {
    ({ peer, runtime } = await draftingRuntime());
    for (const [id, traitor] of [
      ['atreides', atreides],
      ['harkonnen', harkonnen],
    ]) {
      const faction = peer.factions.get(id);
      peer.factions.set(id, { ...faction, cardbacks: { ...faction.cardbacks, traitor } });
    }
    const [a, b] = await dealt(peer, runtime);
    await ready(a, 'ready-a');
    const view = await syncView(b);
    return sendCommand(b, {
      kind: 'swap-ready',
      ready: true,
      round: view.snapshot.swapping.round,
      seat: view.viewer.viewerSeat,
    });
  }

  it('Traitor captures taken either side of a republish still reach setup', async () => {
    const { reply } = await enterSetup(
      '/published/cardback-presets/traitor/cardback.jpg?v=traitor-1',
      '/published/cardback-presets/traitor/cardback.jpg?v=traitor-2'
    );
    expect(reply.type).not.toBe('rejected');
    const { table } = JSON.parse((await runtime.exec('SELECT data FROM current_state'))[0].data);
    const decks = table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(decks.map((deck) => deck.label)).toEqual(['Traitor cards', 'Traitor cards']);
    expect(piecesCanStack(decks[0], decks[1])).toBe(true);
  });

  it('refuses to deal factions whose Traitor decks have different backs, and deals once the draft changes', async () => {
    const back = '/published/cardback-presets/traitor/cardback.jpg?v=traitor-1';
    ({ peer, runtime } = await draftingRuntime());
    for (const [id, traitor] of [
      ['atreides', back],
      ['harkonnen', null],
      ['fremen', back],
    ]) {
      const faction = peer.factions.get(id);
      peer.factions.set(id, { ...faction, cardbacks: { ...faction.cardbacks, traitor } });
    }
    const a = await admitPlayer(peer, runtime, 'a');
    const b = await admitPlayer(peer, runtime, 'b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    const refused = await eventually(async () => {
      const view = await syncView(a);
      return view.snapshot.draft?.failure && view;
    }, 'refused deal');
    expect(refused.snapshot.stage).toBe('drafting');
    expect(refused.snapshot.draft.failure).toBe('The retained traitor decks need a shared back.');
    await accepted(a, { kind: 'draft-ban', factionId: 'harkonnen' });
    await accepted(a, { kind: 'draft-pick', factionId: 'fremen' });
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    const dealtView = await syncView(a);
    expect(dealtView.snapshot.roster.seats.map((entry) => entry.faction.id).sort()).toEqual(['atreides', 'fremen']);
  });
});
