import { expect, test } from 'vitest';

import { followTable, unfollowedLosses } from './tableFeed';
import type { TableFacts, TableMemory } from './tableFeed';
import { newTracker, onBid, placeOf } from './tracker';
import type { CardDef, TrackerState } from './tracker';

const def = (key: string, count = 1): CardDef => ({
  key,
  name: key,
  kind: 'weapon',
  detail: 'Weapon - Projectile',
  face: `https://example.test/${key}.jpg`,
  count,
});
const DECK = [def('shield', 2), def('lasgun'), def('baliset')];
const face = (key: string) => `https://example.test/${key}.jpg`;

const QUIET: TableFacts = { turn: 1, peek: null, round: null, counts: {}, discards: [], own: null };
const facts = (partial: Partial<TableFacts>): TableFacts => ({ ...QUIET, ...partial });

/* Reads each table in turn, carrying the tracker and its memory forward. */
function follow(...tables: Partial<TableFacts>[]): { state: TrackerState; memory: TableMemory } {
  let state = newTracker(DECK, ['atreides', 'emperor', 'harkonnen']);
  let memory: TableMemory | undefined;
  for (const table of tables) {
    ({ state, memory } = followTable(state, memory, facts(table)));
  }
  return { state, memory: memory! };
}

const peekAt = (item: string, key: string) => ({ peek: { item, face: face(key) } });

test('a peek at the card up for bid puts it up for bid, once', () => {
  const { state } = follow(peekAt('t-1', 'lasgun'), peekAt('t-1', 'lasgun'));
  expect(state.seen.map((sighting) => sighting.card)).toEqual(['lasgun#1']);
});

test('the bidder ending a round gives the card on bid to the winner, or sends it back when nobody bid', () => {
  const won = follow(
    peekAt('t-1', 'lasgun'),
    { round: { key: '5:1', winner: 'emperor' }, counts: { emperor: 1 } },
    { round: { key: '5:1', winner: 'emperor' }, counts: { emperor: 1 } }
  ).state;
  expect(won.hands.emperor?.map((slot) => slot.card)).toEqual(['lasgun#1']);
  const passed = follow(peekAt('t-1', 'lasgun'), { round: { key: '5:1', winner: null } }).state;
  expect(onBid(passed)).toBeUndefined();
  expect(placeOf(passed, 'lasgun#1').at).toBe('deck');
});

test('a round that ended before the peek never takes the card the peek shows', () => {
  const { state } = follow({ ...peekAt('t-2', 'lasgun'), round: { key: '5:1', winner: 'emperor' } });
  expect(onBid(state)?.card).toBe('lasgun#1');
  expect(state.hands.emperor).toEqual([]);
});

test('hand counts add the cards the tracker has not seen as unknown cards, and a won card is not counted twice', () => {
  const { state } = follow({ counts: { emperor: 1, harkonnen: 2 } }, peekAt('t-1', 'lasgun'), {
    round: { key: '5:1', winner: 'emperor' },
    counts: { emperor: 2, harkonnen: 2 },
  });
  expect(state.hands.emperor?.map((slot) => slot.card)).toEqual([null, 'lasgun#1']);
  expect(state.hands.harkonnen?.map((slot) => slot.card)).toEqual([null, null]);
});

test("the viewer's own cards are named: an unknown card it was dealt, and a card it won keeps its slot", () => {
  const own = (...cards: [string, string][]) => ({
    faction: 'atreides',
    cards: cards.map(([item, key]) => ({ item, face: face(key) })),
  });
  const { state } = follow(
    { counts: { atreides: 1 } },
    { counts: { atreides: 1 }, own: own(['h-1', 'shield']) },
    peekAt('t-1', 'lasgun'),
    {
      round: { key: '5:1', winner: 'atreides' },
      counts: { atreides: 2 },
      own: own(['h-1', 'shield'], ['t-1', 'lasgun']),
    }
  );
  expect(state.hands.atreides?.map((slot) => slot.card)).toEqual(['shield#1', 'lasgun#1']);
});

test('a card face up on the table is discarded from the hand that holds one card fewer', () => {
  const known = follow(
    peekAt('t-1', 'lasgun'),
    { round: { key: '5:1', winner: 'emperor' }, counts: { emperor: 1 } },
    { counts: { emperor: 0 }, discards: [{ item: 't-1', face: face('lasgun') }] }
  ).state;
  expect(placeOf(known, 'lasgun#1').at).toBe('discard');
  expect(known.hands.emperor).toEqual([]);

  const unknown = follow(
    { counts: { harkonnen: 1 } },
    { counts: { harkonnen: 0 }, discards: [{ item: 'x', face: face('baliset') }] }
  ).state;
  expect(placeOf(unknown, 'baliset#1').at).toBe('discard');
  expect(unknown.hands.harkonnen).toEqual([]);
});

test("the viewer's own card played face up is the copy it held", () => {
  const own = { faction: 'atreides', cards: [{ item: 'h-1', face: face('shield') }] };
  const { state } = follow(
    { counts: { atreides: 1 }, own },
    {
      counts: { atreides: 0 },
      own: { faction: 'atreides', cards: [] },
      discards: [{ item: 'h-1', face: face('shield') }],
    }
  );
  expect(state.discard).toEqual(['shield#1']);
  expect(state.hands.atreides).toEqual([]);
});

test('the discard pile leaving the table at once was shuffled back into the deck', () => {
  const discards = [
    { item: 'a', face: face('lasgun') },
    { item: 'b', face: face('baliset') },
  ];
  const { state, memory } = follow({ discards }, { discards: [] });
  expect(state.discard).toEqual([]);
  expect(memory.discarded).toEqual({});
  const partly = follow({ discards }, { discards: discards.slice(1) }).state;
  expect(partly.discard).toEqual(['lasgun#1', 'baliset#1']);
});

test('reading the same table again changes nothing', () => {
  const table: Partial<TableFacts> = {
    ...peekAt('t-1', 'lasgun'),
    counts: { emperor: 1, harkonnen: 2 },
    discards: [{ item: 'a', face: face('baliset') }],
  };
  const once = follow(table);
  const twice = followTable(once.state, once.memory, facts(table));
  expect(twice.state).toBe(once.state);
});

test('a hand the tracker overfills is reported until the table explains it', () => {
  const { state } = follow({ counts: { emperor: 2 } });
  expect(unfollowedLosses(state, { emperor: 1 })).toEqual({ emperor: 1 });
  expect(unfollowedLosses(state, { emperor: 2 })).toEqual({});
});
