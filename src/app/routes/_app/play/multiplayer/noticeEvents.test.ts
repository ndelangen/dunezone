import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test } from 'vite-plus/test';

import { noticesBetween } from './noticeEvents';

const OWN = 'house-harkonnen';
const OTHER = 'house-atreides';
const NAMES = { [OWN]: 'House Harkonnen', [OTHER]: 'House Atreides' };

/* Only the fields the notices read: a table in play with two seated factions and their players. */
function table(changes: Partial<GameSnapshot> = {}): GameSnapshot {
  return {
    revision: 1,
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

const between = (before: GameSnapshot | undefined, after: GameSnapshot) => noticesBetween(before, after, OWN, NAMES);

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
      sides: sides.map((factionId) => (factionId ? { factionId } : null)),
    } as unknown as GameSnapshot['battle'],
  });
  expect(between(table(battle([OTHER, null])), table(battle([OTHER, OWN])))).toEqual([
    { key: 'battle-b1', kind: 'battle', factionId: OWN, text: 'Your battle in Arrakeen is up' },
  ]);
  expect(between(table(battle([OTHER, OWN])), table(battle([OTHER, OWN])))).toEqual([]);
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
