import { MOVEMENT_PHASE_ID } from '@shared/play/movement';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test, vi } from 'vite-plus/test';

import { noticeStillHolds, noticesBetween, onlyReordered, sameMovementOrder } from './noticeEvents';

/* Storm order reads the faction tokens' sectors; these tables carry no pieces, so the viewer moves first. */
vi.mock('@shared/play/stormSector', () => ({ stormOrder: () => [OWN, OTHER] }));

const OWN = 'house-harkonnen';
const OTHER = 'house-atreides';
const NAMES = { [OWN]: 'House Harkonnen', [OTHER]: 'House Atreides' };

/* Only the fields the notices read: a table in play with two seated factions and their players. */
function table(changes: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    revision: 1,
    phase: 0,
    table: { stormSectorIndex: 0, pieces: [] },
    roster: {
      seats: [
        { id: 'seat-1', faction: { id: OTHER, name: 'House Atreides', color: '#0a0' } },
        { id: 'seat-2', faction: { id: OWN, name: 'House Harkonnen', color: '#000' } },
      ],
    },
    controls: {
      players: [
        { seat: 'seat-1', name: 'Alia' },
        { seat: 'seat-2', name: 'Feyd' },
      ],
    },
    ...changes,
  } as unknown as GameSnapshot;
}

/* Each change the table makes moves its revision on, so a later table is a later revision unless a test says which. */
const between = (before: GameSnapshot | undefined, after: GameSnapshot) =>
  noticesBetween(
    before,
    before && after.revision <= before.revision ? { ...after, revision: before.revision + 1 } : after,
    OWN,
    NAMES
  );

test('a change shown before the table makes it, at the same revision, raises nothing', () => {
  const open = (turn: string) => ({ bidding: { stage: 'open', turn } as GameSnapshot['bidding'] });
  expect(noticesBetween(table(open(OTHER)), table(open(OWN)), OWN, NAMES)).toEqual([]);
});

test('the movement phase starting with the viewer first to move raises their turn, before any faction is done', () => {
  const movementIndex = STANDARD_PHASES.findIndex((phase) => phase.id === MOVEMENT_PHASE_ID);
  expect(between(table({ phase: movementIndex - 1 }), table({ phase: movementIndex, revision: 2 }))).toMatchObject([
    { key: 'ship-2', kind: 'ship', factionId: OWN, text: 'Your turn to ship and move' },
  ]);
});

test('the first snapshot a page sees raises nothing, even on the viewer’s turn', () => {
  expect(between(undefined, table({ bidding: { stage: 'open', turn: OWN } as GameSnapshot['bidding'] }))).toEqual([]);
});

const openBid = (turn: string, round = 1) => ({ bidding: { stage: 'open', turn, round } as GameSnapshot['bidding'] });

test('the bidder coming to the viewer raises their turn once, not again while it stays there', () => {
  expect(between(table(openBid(OTHER)), table({ ...openBid(OWN), revision: 2 }))).toMatchObject([
    { key: 'bid-1-2', kind: 'bid', factionId: OWN, text: 'Your turn to bid' },
  ]);
  expect(between(table(openBid(OWN)), table({ ...openBid(OWN), revision: 3 }))).toEqual([]);
});

test('a round started afresh on the viewer raises their turn again, and the old round’s notice no longer holds', () => {
  expect(between(table(openBid(OWN, 1)), table({ ...openBid(OWN, 2), revision: 3 }))).toMatchObject([
    { key: 'bid-2-3', kind: 'bid', factionId: OWN, text: 'Your turn to bid' },
  ]);
  expect(noticeStillHolds(table(openBid(OWN, 2)), OWN, { key: 'bid-1-2', kind: 'bid' })).toBe(false);
});

test('a battle raises the viewer’s turn once both its sides are claimed, one of them theirs', () => {
  const battle = (sides: (string | null)[]) => ({
    battle: {
      id: 'b1',
      territory: 'Arrakeen',
      stage: 'preparing',
      sides: sides.map((factionId) => (factionId ? { factionId } : null)),
    } as unknown as GameSnapshot['battle'],
  });
  expect(between(table(battle([null, OWN])), table(battle([OTHER, OWN])))).toMatchObject([
    { key: 'battle-b1', kind: 'battle', factionId: OWN, text: 'Your battle in Arrakeen is up' },
  ]);
  expect(between(table(), table(battle([OTHER, OWN])))).toMatchObject([
    { key: 'battle-b1', kind: 'battle', factionId: OWN, text: 'Your battle in Arrakeen is up' },
  ]);
  expect(between(table(battle([OTHER, OWN])), table(battle([OTHER, OWN])))).toEqual([]);
});

test('the viewer’s own claim completing their battle raises nothing, since they made it ready', () => {
  const battle = (sides: (string | null)[]) => ({
    battle: {
      id: 'b1',
      territory: 'Arrakeen',
      stage: 'preparing',
      sides: sides.map((factionId) => (factionId ? { factionId } : null)),
    } as unknown as GameSnapshot['battle'],
  });
  expect(between(table(battle([OTHER, null])), table(battle([OTHER, OWN])))).toEqual([]);
});

test('a payment or bribe to the viewer names the faction recorded as giving it; other transfers raise nothing', () => {
  const transfer = (revision: number, kind: string, giver: string | undefined, destination?: string) =>
    ({ revision, kind, actor: 'Alia', amount: 3, source: 'table', destination, giver }) as NonNullable<
      GameSnapshot['spiceTransfers']
    >[number];
  const after = table({
    spiceTransfers: [
      transfer(1, 'payment', OTHER, OWN),
      transfer(2, 'payment', OTHER, OWN),
      transfer(3, 'bribe', OTHER, OWN),
      transfer(5, 'payment', OWN, OTHER),
      transfer(6, 'collection', OTHER, OWN),
    ],
  });
  expect(between(table({ spiceTransfers: [transfer(1, 'payment', OTHER, OWN)] }), after)).toMatchObject([
    { key: 'spice-2', kind: 'spice', factionId: OTHER, text: 'House Atreides paid you 3 spice' },
    { key: 'spice-3', kind: 'spice', factionId: OTHER, text: 'House Atreides bribed you 3 spice' },
  ]);
});

test('a gift recorded without its giver, or with the viewer’s own faction, names nobody rather than a namesake', () => {
  const transfer = (revision: number, actor: string, giver?: string) =>
    ({ revision, kind: 'payment', actor, amount: 2, source: 'table', destination: OWN, giver }) as NonNullable<
      GameSnapshot['spiceTransfers']
    >[number];
  /* Alia sits at Atreides now, but the gift does not say it came from there. */
  const after = table({ spiceTransfers: [transfer(1, 'Alia'), transfer(2, 'Feyd', OWN)] });
  expect(between(table(), after)).toMatchObject([
    { key: 'spice-1', kind: 'spice', factionId: null, text: 'You were paid 2 spice' },
    { key: 'spice-2', kind: 'spice', factionId: null, text: 'You were paid 2 spice' },
  ]);
});

test('a new alliance offer to the viewer names who offers it', () => {
  const offers = (list: { from: string; to: string; id: number }[]) => ({
    alliances: { groups: [], offers: list.map((offer) => ({ ...offer, at: 1 })) },
  });
  expect(
    between(
      table(offers([])),
      table(
        offers([
          { from: OTHER, to: OWN, id: 4 },
          { from: OWN, to: OTHER, id: 5 },
        ])
      )
    )
  ).toMatchObject([
    { key: 'alliance-4', kind: 'alliance', factionId: OTHER, text: 'House Atreides offers you an alliance' },
  ]);
});

test('a notice holds only while what it announced stands; payments hold until they fade', () => {
  expect(noticeStillHolds(table(openBid(OWN)), OWN, { key: 'bid-1-2', kind: 'bid' })).toBe(true);
  expect(noticeStillHolds(table(openBid(OTHER)), OWN, { key: 'bid-1-2', kind: 'bid' })).toBe(false);
  const battle = (stage: string) =>
    table({
      battle: { id: 'b1', stage, sides: [{ factionId: OWN, ready: false }] } as unknown as GameSnapshot['battle'],
    });
  expect(noticeStillHolds(battle('preparing'), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(true);
  expect(noticeStillHolds(battle('countdown'), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(false);
  const offers = (ids: number[]) =>
    table({ alliances: { groups: [], offers: ids.map((id) => ({ from: OTHER, to: OWN, at: 1, id })) } });
  expect(noticeStillHolds(offers([4]), OWN, { key: 'alliance-4', kind: 'alliance' })).toBe(true);
  expect(noticeStillHolds(offers([]), OWN, { key: 'alliance-4', kind: 'alliance' })).toBe(false);
  expect(noticeStillHolds(table(), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(false);
  expect(noticeStillHolds(table(), OWN, { key: 'spice-3', kind: 'spice' })).toBe(true);
});

test('a batch of transfers raises its notices oldest first, though the table lists them newest first', () => {
  const paid = (revision: number) => ({
    revision,
    kind: 'payment' as const,
    actor: 'nobody',
    amount: 1,
    source: 'table',
    destination: OWN,
  });
  const keys = between(table(), table({ spiceTransfers: [paid(5), paid(4)] } as Partial<GameSnapshot>)).map(
    (notice) => notice.key
  );
  expect(keys).toEqual(['spice-4', 'spice-5']);
});

test('a battle whose viewer is already Ready raises nothing, and a notice for it no longer holds once they are', () => {
  const battle = (ready: boolean) =>
    ({
      battle: {
        id: 'b1',
        territory: 'Arrakeen',
        stage: 'preparing',
        sides: [
          { factionId: OWN, ready, choice: null },
          { factionId: OTHER, ready: false, choice: null },
        ],
      },
    }) as unknown as Partial<GameSnapshot>;
  const claimed = { battle: { ...battle(true).battle!, sides: [battle(true).battle!.sides[0], null] } };
  expect(between(table(claimed as Partial<GameSnapshot>), table(battle(true)))).toEqual([]);
  expect(noticeStillHolds(table(battle(true)), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(false);
  expect(noticeStillHolds(table(battle(false)), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(true);
});

test('a batch spanning several revisions comes out in the order things happened', () => {
  const after = table({
    ...openBid(OWN),
    revision: 9,
    spiceTransfers: [{ revision: 7, kind: 'payment', actor: 'nobody', amount: 1, source: 'table', destination: OWN }],
    alliances: { groups: [], offers: [{ from: OTHER, to: OWN, at: 0, id: 8 }] },
  } as Partial<GameSnapshot>);
  expect(between(table(openBid(OTHER)), after).map((notice) => notice.kind)).toEqual(['spice', 'alliance', 'bid']);
});

test('only a new movement order, with nobody newly done, counts as a reorder the viewer may have made', () => {
  const moves = (done: string[], order?: string[]) =>
    table({ movement: { done, ...(order ? { order } : {}) } as GameSnapshot['movement'] });
  expect(onlyReordered(moves([]), moves([], [OWN, OTHER]))).toBe(true);
  expect(onlyReordered(moves([]), moves([OTHER], [OWN]))).toBe(false);
  expect(onlyReordered(moves([], [OWN]), moves([], [OWN]))).toBe(false);
});

test('only the exact movement order a drag showed counts as the one the room confirmed', () => {
  const order = (list: string[]) =>
    table({ movement: { done: [], order: list } as unknown as GameSnapshot['movement'] });
  expect(sameMovementOrder(order([OWN, OTHER]), order([OWN, OTHER]))).toBe(true);
  expect(sameMovementOrder(order([OWN, OTHER]), order([OWN, OTHER, 'house-fremen']))).toBe(false);
});
