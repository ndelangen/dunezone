import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { cardPage, tokenPage } from './native-catalogue.fixture.mjs';
import { draftingRuntime } from './native-drafting.fixture.mjs';
import { admitPlayer, eventually, sendCommand, syncView } from './native-runtime.fixture.mjs';

describe('Retained supply at setup entry', () => {
  let peer, runtime;
  beforeEach(async () => {
    ({ peer, runtime } = await draftingRuntime(
      [],
      Array.from({ length: 12 }, (_, index) => cardPage(`card-${index}`))
    ));
    const extra = tokenPage('shared-extra');
    peer.catalogue.set('token-disc/shared-extra', extra);
    for (const id of ['atreides', 'harkonnen']) {
      await runtime.capture('faction', id, {
        extras: [{ type: 'token-disc', slug: 'shared-extra' }],
        provisional: true,
      });
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix) => admitPlayer(peer, runtime, suffix);
  async function accepted(connection, action) {
    const { reply } = await sendCommand(connection, action);
    expect(reply.type, JSON.stringify(reply)).not.toBe('rejected');
    return syncView(connection);
  }
  async function seat(connection, approver, target) {
    const view = await accepted(connection, { kind: 'seat-request', ...(target ? { seat: target } : {}) });
    const request = view.snapshot.controls.seatRequests.find((entry) => entry.own);
    await accepted(approver, { kind: 'seat-approve', requestId: request.id });
  }
  async function dealt() {
    const a = await admit('a');
    const b = await admit('b');
    await seat(b, a);
    await accepted(a, { kind: 'draft-ready', ready: true });
    await accepted(b, { kind: 'draft-ready', ready: true });
    await eventually(async () => (await syncView(a)).snapshot.stage === 'swapping', 'assignment');
    return [a, b];
  }
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
  const stored = async () => JSON.parse((await runtime.exec('SELECT data FROM current_state'))[0].data);

  it('supplies retained pieces and starting spice once despite source deletion, command replay and cold restore', async () => {
    const [a, b] = await dealt();
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
      expect(initial.factionInventories[faction]).toHaveLength(capture.components.leaders.length + 1);
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

  it('waits for the last replacement, preserves faction privacy and keeps unfinished progression unavailable', async () => {
    const [, b] = await dealt();
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
    for (const action of [
      { kind: 'phase' },
      { kind: 'turn', turn: 2 },
      { kind: 'ready', ready: true },
      { kind: 'reset' },
    ]) {
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
    const [a, b] = await dealt();
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
