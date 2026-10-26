import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import type { TablePiece } from '../../src/shared/play/model';
import { placementAnchorForPose } from '../../src/shared/play/tableFurnitureLayout';
import { isCollisionFreePosition, piecesCanStack } from '../../src/shared/play/tablePhysics';
import { cardPage, tokenPage } from './native-catalogue.fixture.ts';
import { dealt, draftingRuntime } from './native-drafting.fixture.ts';
import { readSnapshot } from './native-runtime.fixture.ts';
import type { NativeConnection } from './native-runtime.fixture.ts';
import { required } from './native-runtime.fixture.ts';
import type { NativePeer, NativeRuntime } from './native-runtime.fixture.ts';
import { accepted, admitPlayer, eventually, seat, sendCommand, syncView } from './native-runtime.fixture.ts';

/* Every card face in the game reaches every page by design, as a sorted list that ties no face to a card; the rest of a frame must not. */
const shown = (value: unknown) =>
  JSON.stringify(value, (key: string, entry: unknown) => (key === 'cardFaces' ? undefined : entry));

async function ready(connection: NativeConnection, commandId: string) {
  const view = await syncView(connection);
  const message = {
    type: 'command' as const,
    commandId,
    expectedRevision: view.snapshot.revision,
    action: {
      kind: 'swap-ready' as const,
      ready: true,
      round: required(view.snapshot.swapping).round,
      seat: view.viewer.viewerSeat,
    },
  };
  connection.socket.send(JSON.stringify(message));
  await eventually(
    () => connection.messages.some((entry) => 'completedCommandId' in entry && entry.completedCommandId === commandId),
    'readiness committed'
  );
  return message;
}

describe('Retained supply at setup entry', () => {
  let peer: NativePeer, runtime: NativeRuntime;
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
        ...required(entry),
        data: { ...required(required(entry).data), extras: [{ type: 'token-disc' as const, slug: 'shared-extra' }] },
      });
      await runtime.capture('faction', id, { provisional: true });
    }
  });
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });
  const admit = (suffix: string) => admitPlayer(runtime, suffix);
  const stored = async () =>
    readSnapshot((await runtime.exec<{ data: string }>('SELECT data FROM current_state'))[0].data);

  it('supplies retained pieces and starting spice once despite source deletion, command replay and cold restore', async () => {
    const [a, b] = await dealt(runtime);
    const captures = await runtime.captures();
    peer.catalogue.clear();
    peer.factions.clear();
    peer.rulesets.clear();
    await ready(a, 'ready-a');
    const last = await ready(b, 'ready-b');
    const first = await syncView(b);
    expect(first.snapshot.stage).toBe('setup');
    expect(required(first.snapshot.bank).balance).toBeGreaterThan(0);
    const initial = await stored();
    const treachery = initial.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck');
    for (const stackKey of ['deck:treachery-deck', 'deck:spice-deck']) {
      const suppliedDeck = initial.table.pieces.find((piece) => piece.stackKey === stackKey);
      expect(placementAnchorForPose(required(suppliedDeck), required(suppliedDeck).position)).not.toBeNull();
      expect(
        isCollisionFreePosition(
          required(suppliedDeck),
          required(suppliedDeck).position,
          initial.table.pieces.filter((piece) => piece !== suppliedDeck)
        )
      ).toBe(true);
    }
    expect(new Set(required(treachery).items.map((item) => required(item.artwork).front)).size).toBe(12);
    const publicDeck = first.snapshot.table.pieces.find((piece) => piece.stackKey === 'deck:treachery-deck');
    expect(
      required(publicDeck).items.every(
        (item) => !item.faceUp && !required(item.artwork).front && !required(item.artwork).name
      )
    ).toBe(true);
    const decks = initial.table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(decks).toHaveLength(2);
    expect(decks.every((deck: TablePiece) => deck.items.every((item) => !item.faceUp))).toBe(true);
    expect(decks.map((deck: TablePiece) => deck.label)).toEqual(['Traitor cards', 'Traitor cards']);
    const extras = Object.values(initial.factionInventories)
      .flat()
      .filter((piece) => piece.label === 'shared-extra');
    expect(extras).toHaveLength(2);
    expect(new Set(extras.map((piece) => piece.id)).size).toBe(2);
    expect(new Set(extras.flatMap((piece) => piece.items.map((item) => item.id))).size).toBe(2);
    for (const capture of captures.factions) {
      const faction = capture.faction.id;
      expect(initial.factionBanks[faction]).toBe(capture.definition.rules.spiceCount);
      const token = initial.table.pieces.find((piece) => piece.stackKey === `faction-token:${faction}`);
      expect(required(token).items).toEqual([
        expect.objectContaining({
          faceUp: true,
          artwork: expect.objectContaining({
            /* A faction token has no back of its own; the table draws a black prohibition sign over its front. */
            front: capture.components.token.front,
            back: capture.components.token.front,
          }),
        }),
      ]);
      expect(
        initial.table.pieces
          .filter((piece) => piece.owner === faction && piece !== token)
          .reduce((sum, piece) => sum + piece.items.length, 0)
      ).toBe(capture.components.troops.reduce((sum, troop) => sum + troop.count, 0));
      expect(initial.factionInventories[faction].map((piece) => piece.label)).toEqual([
        ...capture.components.leaders.map((leader) => leader.name),
        'shared-extra',
      ]);
      expect(initial.table.pieces.filter((piece) => piece.owner === faction).map((piece) => piece.label)).toEqual([
        `${capture.faction.name} token`,
        ...capture.components.troops.map((troop) => troop.name),
      ]);
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
    await accepted(active, { kind: 'deck-draw' as const, pieceId: required(publicDeck).id });
    const drawn = await syncView(active);
    expect(drawn.snapshot.hand).toHaveLength(required(first.snapshot.hand).length + 1);
    expect(required(required(required(drawn.snapshot.hand).at(-1)).items[0].artwork).front).toBe(
      required(required(required(treachery).items.at(-1)).artwork).front
    );
    const outsider = await syncView(await admit('observer'));
    expect(outsider.snapshot.hand).toBeUndefined();
    expect(shown(outsider.snapshot)).not.toContain(required(required(required(treachery).items.at(-1)).artwork).front);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 1 }]);
  });

  it('waits for the last replacement, preserves faction privacy and keeps progression gated', async () => {
    const [, b] = await dealt(runtime);
    const old = await syncView(b);
    await accepted(b, { kind: 'seat-depart' as const });
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
    for (const action of [{ kind: 'phase' as const }, { kind: 'reset' as const }]) {
      expect((await sendCommand(c, action)).reply.type).toBe('rejected');
    }
    const balance = required(supplied.snapshot.bank).balance;
    await accepted(c, { kind: 'bank-withdraw' as const, amount: 1 });
    const spent = await syncView(c);
    expect(required(spent.snapshot.bank).balance).toBe(balance - 1);
    await accepted(c, { kind: 'seat-depart' as const });
    const replacement = await admit('d');
    await seat(replacement, restored, old.viewer.viewerSeat);
    const inherited = await syncView(replacement);
    expect(inherited.snapshot.bank).toEqual(spent.snapshot.bank);
    expect(inherited.snapshot.hand).toEqual(spent.snapshot.hand);
    expect(await runtime.exec('SELECT COUNT(*) AS count FROM setup_supply')).toEqual([{ count: 1 }]);
  });

  it('rolls supply and its receipt back with the final readiness command', async () => {
    const [a, b] = await dealt(runtime);
    await ready(a, 'first-ready');
    const before = await stored();
    await runtime.exec(
      "CREATE TRIGGER refuse_receipt BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'receipt failure'); END"
    );
    const view = await syncView(b);
    const result = await sendCommand(b, {
      kind: 'swap-ready' as const,
      ready: true,
      round: required(view.snapshot.swapping).round,
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
  let peer: NativePeer, runtime: NativeRuntime;
  afterEach(async () => {
    await runtime?.close();
    await peer?.close();
  });

  /* Deals a two-player game whose factions the catalogue serves with these Traitor backs, readies the first player and sends the second player's final readiness. */
  async function enterSetup(atreides: string, harkonnen: string | null) {
    ({ peer, runtime } = await draftingRuntime());
    for (const [id, traitor] of [
      ['atreides', atreides],
      ['harkonnen', harkonnen],
    ] as const) {
      const faction = peer.factions.get(id);
      peer.factions.set(id, { ...required(faction), cardbacks: { ...required(faction).cardbacks, traitor } });
    }
    const [a, b] = await dealt(runtime);
    await ready(a, 'ready-a');
    const view = await syncView(b);
    return sendCommand(b, {
      kind: 'swap-ready' as const,
      ready: true,
      round: required(view.snapshot.swapping).round,
      seat: view.viewer.viewerSeat,
    });
  }

  it('Traitor captures taken either side of a republish still reach setup', async () => {
    const { reply } = await enterSetup(
      '/published/cardback-presets/traitor/cardback.jpg?v=traitor-1',
      '/published/cardback-presets/traitor/cardback.jpg?v=traitor-2'
    );
    expect(reply.type).not.toBe('rejected');
    const { table } = readSnapshot((await runtime.exec<{ data: string }>('SELECT data FROM current_state'))[0].data);
    const decks = table.pieces.filter((piece) => piece.stackKey === 'cards:traitor');
    expect(decks.map((deck: TablePiece) => deck.label)).toEqual(['Traitor cards', 'Traitor cards']);
    expect(piecesCanStack(decks[0], decks[1])).toBe(true);
  });

  it("setup refuses a table where one faction's Traitor deck has a back and another's has none", async () => {
    const { reply } = await enterSetup('/published/cardback-presets/traitor/cardback.jpg?v=traitor-1', null);
    expect(reply).toMatchObject({
      type: 'rejected' as const,
      message: 'The retained traitor decks need a shared back.',
    });
  });
});
