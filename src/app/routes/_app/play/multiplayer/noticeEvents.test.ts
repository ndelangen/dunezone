import { MOVEMENT_PHASE_ID } from '@shared/play/movement';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test, vi } from 'vite-plus/test';

import { noticeStillHolds, noticesBetween } from './noticeEvents';

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
  expect(between(table({ phase: movementIndex - 1 }), table({ phase: movementIndex, revision: 2 }))).toEqual([
    { key: 'ship-2', kind: 'ship', factionId: OWN, text: 'Your turn to ship and move' },
  ]);
});

test('the first snapshot a page sees raises nothing, even on the viewer’s turn', () => {
  expect(between(undefined, table({ bidding: { stage: 'open', turn: OWN } as GameSnapshot['bidding'] }))).toEqual([]);
});

test('the bidder coming to the viewer raises their turn once, not again while it stays there', () => {
  const open = (turn: string) => ({ bidding: { stage: 'open', turn } as GameSnapshot['bidding'] });
  expect(between(table(open(OTHER)), table({ ...open(OWN), revision: 2 }))).toEqual([
    { key: 'bid-2', kind: 'bid', factionId: OWN, text: 'Your turn to bid' },
  ]);
  expect(between(table(open(OWN)), table({ ...open(OWN), revision: 3 }))).toEqual([]);
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
  expect(between(table(battle([null, OWN])), table(battle([OTHER, OWN])))).toEqual([
    { key: 'battle-b1', kind: 'battle', factionId: OWN, text: 'Your battle in Arrakeen is up' },
  ]);
  expect(between(table(), table(battle([OTHER, OWN])))).toEqual([
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

test('a payment or bribe to the viewer names the giving faction; their own and other transfers raise nothing', () => {
  const transfer = (revision: number, kind: string, actor: string, destination?: string) =>
    ({ revision, kind, actor, amount: 3, source: 'table', destination }) as NonNullable<
      GameSnapshot['spiceTransfers']
    >[number];
  const after = table({
    spiceTransfers: [
      transfer(1, 'payment', 'Alia', OWN),
      transfer(2, 'payment', 'Alia', OWN),
      transfer(3, 'bribe', 'Alia', OWN),
      transfer(4, 'payment', 'Feyd', OWN),
      transfer(5, 'payment', 'Alia', OTHER),
      transfer(6, 'collection', 'Alia', OWN),
    ],
  });
  expect(between(table({ spiceTransfers: [transfer(1, 'payment', 'Alia', OWN)] }), after)).toEqual([
    { key: 'spice-2', kind: 'spice', factionId: OTHER, text: 'House Atreides paid you 3 spice' },
    { key: 'spice-3', kind: 'spice', factionId: OTHER, text: 'House Atreides bribed you 3 spice' },
  ]);
});

test('a payment from a player the table cannot tell apart names no faction', () => {
  const transfer = (revision: number, actor: string) =>
    ({ revision, kind: 'payment', actor, amount: 2, source: 'table', destination: OWN }) as NonNullable<
      GameSnapshot['spiceTransfers']
    >[number];
  const shared = {
    controls: {
      players: [
        { seat: 'seat-1', name: 'Alia' },
        { seat: 'seat-2', name: 'Alia' },
      ],
    },
  } as unknown as Partial<GameSnapshot>;
  const after = table({ ...shared, spiceTransfers: [transfer(1, 'Alia'), transfer(2, '[deleted user]')] });
  expect(between(table(shared), after)).toEqual([
    { key: 'spice-1', kind: 'spice', factionId: OWN, text: 'You were paid 2 spice' },
    { key: 'spice-2', kind: 'spice', factionId: OWN, text: 'You were paid 2 spice' },
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
  ).toEqual([{ key: 'alliance-4', kind: 'alliance', factionId: OTHER, text: 'House Atreides offers you an alliance' }]);
});

test('a notice holds only while what it announced stands; payments hold until they fade', () => {
  const open = (turn: string) => table({ bidding: { stage: 'open', turn } as GameSnapshot['bidding'] });
  expect(noticeStillHolds(open(OWN), OWN, { key: 'bid-2', kind: 'bid' })).toBe(true);
  expect(noticeStillHolds(open(OTHER), OWN, { key: 'bid-2', kind: 'bid' })).toBe(false);
  const battle = (stage: string) =>
    table({ battle: { id: 'b1', stage, sides: [] } as unknown as GameSnapshot['battle'] });
  expect(noticeStillHolds(battle('preparing'), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(true);
  expect(noticeStillHolds(battle('countdown'), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(false);
  const offers = (ids: number[]) =>
    table({ alliances: { groups: [], offers: ids.map((id) => ({ from: OTHER, to: OWN, at: 1, id })) } });
  expect(noticeStillHolds(offers([4]), OWN, { key: 'alliance-4', kind: 'alliance' })).toBe(true);
  expect(noticeStillHolds(offers([]), OWN, { key: 'alliance-4', kind: 'alliance' })).toBe(false);
  expect(noticeStillHolds(table(), OWN, { key: 'battle-b1', kind: 'battle' })).toBe(false);
  expect(noticeStillHolds(table(), OWN, { key: 'spice-3', kind: 'spice' })).toBe(true);
});
