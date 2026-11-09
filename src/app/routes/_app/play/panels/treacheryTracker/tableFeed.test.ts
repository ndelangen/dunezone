import { expect, test } from 'vite-plus/test';

import { followTable } from './tableFeed';
import type { TableFacts, TableMemory } from './tableFeed';
import { newTracker, onBid, trackerReducer } from './tracker';
import type { CardDef, TrackerState } from './tracker';

const def = (key: string, count = 1): CardDef => ({
  key,
  name: key,
  kind: 'weapon',
  detail: 'Weapon - Projectile',
  face: `https://example.test/${key}.jpg`,
  count,
});
const DECK = [def('shield', 2), def('lasgun')];
const peekAt = (item: string, key: string): TableFacts => ({
  turn: 2,
  peek: { item, face: `https://example.test/${key}.jpg` },
});

/* Reads each table in turn, carrying the tracker and its memory forward. */
function follow(state: TrackerState, ...tables: TableFacts[]) {
  let memory: TableMemory | undefined;
  for (const table of tables) {
    ({ state, memory } = followTable(state, memory, table));
  }
  return { state, memory };
}

const fresh = () => newTracker(DECK, ['atreides', 'emperor']);

test('a peek at the card up for bid puts it up for bid in the table turn, once', () => {
  const { state } = follow(fresh(), peekAt('t-1', 'lasgun'), peekAt('t-1', 'lasgun'));
  expect(state.seen).toEqual([{ id: 'bid-1', turn: 2, card: 'lasgun#1' }]);
});

test('a second copy peeked at later comes up as the next copy', () => {
  const { state } = follow(fresh(), peekAt('t-1', 'shield'), peekAt('t-2', 'shield'));
  expect(state.seen.map((sighting) => sighting.card)).toEqual(['shield#2', 'shield#1']);
});

test('a peek dismissed as never up for bid stays dismissed', () => {
  const first = follow(fresh(), peekAt('t-1', 'lasgun'));
  const dismissed = trackerReducer(first.state, { kind: 'cancel', sighting: onBid(first.state)!.id });
  const again = followTable(dismissed, first.memory, peekAt('t-1', 'lasgun'));
  expect(onBid(again.state)).toBeUndefined();
});

test('a peek names the unknown card already on bid instead of bidding again', () => {
  const unknown = trackerReducer(fresh(), { kind: 'bid', card: null, turn: 2 });
  const { state } = follow(unknown, peekAt('t-1', 'lasgun'));
  expect(state.seen).toEqual([{ id: 'bid-1', turn: 2, card: 'lasgun#1' }]);
});

test('a read that follows nothing hands back the same tracker and memory', () => {
  const first = follow(fresh(), peekAt('t-1', 'lasgun'));
  const again = followTable(first.state, first.memory, peekAt('t-1', 'lasgun'));
  expect(again.state).toBe(first.state);
  expect(again.memory).toBe(first.memory);
});

test('a peek at a card with no copy left is followed once a copy is free again', () => {
  const held = trackerReducer(fresh(), { kind: 'add', faction: 'emperor', card: 'lasgun#1' });
  const blocked = followTable(held, undefined, peekAt('t-1', 'lasgun'));
  expect(blocked.memory).toBeUndefined();
  const freed = trackerReducer(blocked.state, { kind: 'place', card: 'lasgun#1', at: 'deck' });
  expect(onBid(followTable(freed, blocked.memory, peekAt('t-1', 'lasgun')).state)?.card).toBe('lasgun#1');
});

test('no peek, or a card with no copy left in the deck, leaves the tracker as it was', () => {
  const state = fresh();
  expect(followTable(state, undefined, { turn: 1, peek: null }).state).toBe(state);
  const held = trackerReducer(state, { kind: 'add', faction: 'emperor', card: 'lasgun#1' });
  expect(followTable(held, undefined, peekAt('t-1', 'lasgun')).state).toBe(held);
});
