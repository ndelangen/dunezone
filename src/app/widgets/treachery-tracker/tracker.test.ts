import { expect, test } from 'vitest';

import {
  awaitingWinner,
  currentTurn,
  groupCount,
  newTracker,
  onBid,
  reservedCards,
  sightingCard,
  trackerReducer,
  unplaced,
} from './tracker';
import type { CardDef, TrackerAction, TrackerState } from './tracker';

const def = (key: string, detail: string, count = 1): CardDef => ({
  key,
  name: key,
  kind: detail.split(' - ')[0]!.toLowerCase() as CardDef['kind'],
  detail,
  face: `https://example.test/${key}.jpg`,
  count,
});
const DECK = [def('shield', 'Defense - Projectile', 2), def('lasgun', 'Weapon - Special'), def('baliset', 'Worthless')];

const run = (...actions: TrackerAction[]): TrackerState =>
  actions.reduce(trackerReducer, newTracker(DECK, ['atreides', 'emperor']));

test('an unknown card won and then discarded as a named card keeps that name on its auction', () => {
  const state = run(
    { kind: 'bid', card: null, turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'identify', faction: 'emperor', slot: 'slot-2', card: 'lasgun#1' },
    { kind: 'discard', faction: 'emperor', slot: 'slot-2' }
  );
  const sighting = state.seen[0]!;
  expect(sightingCard(state, sighting)).toBe('lasgun#1');
  expect(state.discard).toEqual(['lasgun#1']);
  expect(awaitingWinner(state, sighting)).toBe(false);
});

test('taking back a mistaken win puts the card back on bid', () => {
  const state = run(
    { kind: 'bid', card: 'shield#1', turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'undo', faction: 'emperor', slot: 'slot-2' }
  );
  expect(onBid(state)?.id).toBe('bid-1');
  expect(state.hands.emperor).toEqual([]);
});

test('the card on bid is the oldest one still waiting for a winner', () => {
  const state = run({ kind: 'bid', card: 'shield#1', turn: 1 }, { kind: 'bid', card: 'lasgun#1', turn: 1 });
  expect(onBid(state)?.card).toBe('shield#1');
});

test("a table's turn outranks the turn of the newest card on bid", () => {
  const state = run({ kind: 'bid', card: 'shield#1', turn: 1 });
  expect(currentTurn(state)).toBe(1);
  expect(currentTurn(state, 3)).toBe(3);
});

test('group counts read in the singular for one card', () => {
  expect(groupCount('worthless', 1)).toBe('1 worthless');
  expect(groupCount('defense-poison', 1)).toBe('1 poison defense');
  expect(groupCount('defense-poison', 2)).toBe('2 poison defenses');
});

test('a finished auction stays finished after its card is discarded and reshuffled', () => {
  const state = run(
    { kind: 'bid', card: 'shield#1', turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'discard', faction: 'emperor', slot: 'slot-2' },
    { kind: 'reshuffle' },
    { kind: 'bid', card: 'lasgun#1', turn: 2 }
  );
  expect(awaitingWinner(state, state.seen[1]!)).toBe(false);
  expect(onBid(state)?.card).toBe('lasgun#1');
});

test('a card on bid sent straight to the discard pile ends its auction for good', () => {
  const state = run(
    { kind: 'bid', card: 'shield#1', turn: 1 },
    { kind: 'place', card: 'shield#1', at: 'discard' },
    { kind: 'reshuffle' }
  );
  expect(onBid(state)).toBeUndefined();
});

test('a copy on bid is reserved, so a second identical card goes up as the other copy', () => {
  const state = run({ kind: 'bid', card: 'shield#1', turn: 1 });
  expect([...reservedCards(state)]).toEqual(['shield#1']);
  const won = run(
    { kind: 'bid', card: 'shield#1', turn: 1 },
    { kind: 'bid', card: 'shield#2', turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' }
  );
  expect(onBid(won)?.card).toBe('shield#2');
  expect(won.hands.emperor?.map((slot) => slot.card)).toEqual(['shield#1']);
});

test('taking back a card picked from the discard pile returns it to the pile', () => {
  const state = run(
    { kind: 'place', card: 'baliset#1', at: 'discard' },
    { kind: 'add', faction: 'emperor', card: 'baliset#1' },
    { kind: 'undo', faction: 'emperor', slot: 'slot-1' }
  );
  expect(state.discard).toEqual(['baliset#1']);
  expect(unplaced(state).map((copy) => copy.id)).not.toContain('baliset#1');
});

test('taking back a card picked from another hand returns it to that hand', () => {
  const state = run(
    { kind: 'add', faction: 'atreides', card: 'lasgun#1' },
    { kind: 'add', faction: 'emperor', card: 'lasgun#1' },
    { kind: 'undo', faction: 'emperor', slot: 'slot-2' }
  );
  expect(state.hands.atreides).toEqual([{ id: 'slot-1', card: 'lasgun#1' }]);
  expect(state.hands.emperor).toEqual([]);
});
