import { expect, test } from 'vitest';

import {
  awaitingWinner,
  currentTurn,
  drawPile,
  groupCount,
  newTracker,
  onBid,
  placeOf,
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

test('an unknown winner named as a card seen on bid settles that auction too', () => {
  const state = run(
    { kind: 'bid', card: null, turn: 1 },
    { kind: 'bid', card: 'shield#1', turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'identify', faction: 'emperor', slot: 'slot-3', card: 'shield#1' },
    { kind: 'discard', faction: 'emperor', slot: 'slot-3' },
    { kind: 'reshuffle' }
  );
  expect(onBid(state)).toBeUndefined();
});

test('the draw pile leaves out every card on bid, known or not', () => {
  const state = run({ kind: 'bid', card: 'shield#1', turn: 1 }, { kind: 'bid', card: null, turn: 1 });
  const pile = drawPile(state);
  expect(pile.copies.map((copy) => copy.id)).toEqual(['shield#2', 'lasgun#1', 'baliset#1']);
  expect(pile.count).toBe(2);
});

/* A small seeded generator, so a failing sequence repeats. */
function seeded(seed: number) {
  let value = seed;
  return (below: number) => {
    value = (value * 1_103_515_245 + 12_345) % 2_147_483_648;
    return value % below;
  };
}

function randomAction(state: TrackerState, pick: (below: number) => number): TrackerAction | null {
  const factions = Object.keys(state.hands);
  const faction = factions[pick(factions.length)]!;
  const ids = state.copies.map((copy) => copy.id);
  const anyCard = ids[pick(ids.length)]!;
  const slots = Object.entries(state.hands).flatMap(([owner, held]) => held.map((slot) => ({ owner, slot })));
  const held = slots[pick(Math.max(1, slots.length))];
  const pending = state.seen.filter((sighting) => awaitingWinner(state, sighting));
  const free = unplaced(state).filter((copy) => !reservedCards(state).has(copy.id));
  switch (pick(9)) {
    case 0:
      return { kind: 'add', faction, card: pick(3) === 0 ? null : anyCard };
    case 1:
      return held && held.slot.card === null
        ? { kind: 'identify', faction: held.owner, slot: held.slot.id, card: anyCard }
        : null;
    case 2:
      return held ? { kind: 'discard', faction: held.owner, slot: held.slot.id } : null;
    case 3:
      return held ? { kind: 'give', faction: held.owner, slot: held.slot.id, to: faction } : null;
    case 4:
      return held ? { kind: 'undo', faction: held.owner, slot: held.slot.id } : null;
    case 5:
      return { kind: 'place', card: anyCard, at: pick(2) === 0 ? 'deck' : 'discard' };
    case 6:
      return { kind: 'reshuffle' };
    case 7:
      return { kind: 'bid', card: pick(3) === 0 || free.length === 0 ? null : free[pick(free.length)]!.id, turn: 1 };
    default:
      return pending.length > 0 ? { kind: 'win', sighting: pending[pick(pending.length)]!.id, faction } : null;
  }
}

function checkInvariants(state: TrackerState) {
  const known = [
    ...Object.values(state.hands)
      .flat()
      .flatMap((slot) => (slot.card ? [slot.card] : [])),
    ...state.discard,
  ];
  expect(new Set(known).size).toBe(known.length);
  const slotIds = new Set(
    Object.values(state.hands)
      .flat()
      .map((slot) => slot.id)
  );
  for (const sighting of state.seen) {
    if (sighting.slot) {
      expect(slotIds.has(sighting.slot)).toBe(true);
    }
    if (sighting.card && awaitingWinner(state, sighting)) {
      expect(placeOf(state, sighting.card).at).toBe('deck');
    }
  }
  expect(drawPile(state).count).toBeGreaterThanOrEqual(0);
}

const pendingIds = (state: TrackerState) =>
  new Set(state.seen.filter((sighting) => awaitingWinner(state, sighting)).map((sighting) => sighting.id));

test('no sequence of actions breaks the tracker, and only a bid or a take-back opens an auction', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    const pick = seeded(seed);
    let state = newTracker(DECK, ['atreides', 'emperor', 'harkonnen']);
    for (let step = 0; step < 60; step += 1) {
      const action = randomAction(state, pick);
      if (!action) {
        continue;
      }
      const before = pendingIds(state);
      const next = trackerReducer(state, action);
      checkInvariants(next);
      if (action.kind !== 'bid' && action.kind !== 'undo') {
        for (const id of pendingIds(next)) {
          expect(before.has(id), `seed ${seed}, step ${step}: ${action.kind} reopened ${id}`).toBe(true);
        }
      }
      state = next;
    }
  }
});
