import { expect, test } from 'vitest';

import {
  awaitingWinner,
  chooserCards,
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
  actions.reduce((state, action) => trackerReducer(state, action), newTracker(DECK, ['atreides', 'emperor']));

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

type Pick = (below: number) => number;

/* What a random step can pick from: a faction, any copy, a held slot, the auctions waiting and the copies free to bid. */
function choices(state: TrackerState, pick: Pick) {
  const factions = Object.keys(state.hands);
  const ids = state.copies.map((copy) => copy.id);
  const slots = Object.entries(state.hands).flatMap(([owner, held]) => held.map((slot) => ({ owner, slot })));
  const free = unplaced(state).filter((copy) => !reservedCards(state).has(copy.id));
  return {
    faction: factions[pick(factions.length)]!,
    anyCard: ids[pick(ids.length)]!,
    held: slots[pick(Math.max(1, slots.length))],
    pending: state.seen.filter((sighting) => awaitingWinner(state, sighting)),
    free,
  };
}

type Choices = ReturnType<typeof choices>;
const onHeld = (make: (held: NonNullable<Choices['held']>, c: Choices) => TrackerAction | null) => (c: Choices) =>
  c.held ? make(c.held, c) : null;

const STEPS: readonly ((c: Choices, pick: Pick) => TrackerAction | null)[] = [
  (c, pick) => ({ kind: 'add', faction: c.faction, card: pick(3) === 0 ? null : c.anyCard }),
  onHeld((held, c) =>
    held.slot.card === null ? { kind: 'identify', faction: held.owner, slot: held.slot.id, card: c.anyCard } : null
  ),
  onHeld((held) => ({ kind: 'discard', faction: held.owner, slot: held.slot.id })),
  onHeld((held, c) => ({ kind: 'give', faction: held.owner, slot: held.slot.id, to: c.faction })),
  onHeld((held) => ({ kind: 'undo', faction: held.owner, slot: held.slot.id })),
  (c, pick) => ({ kind: 'place', card: c.anyCard, at: pick(2) === 0 ? 'deck' : 'discard' }),
  () => ({ kind: 'reshuffle' }),
  (c, pick) => ({
    kind: 'bid',
    card: pick(3) === 0 || c.free.length === 0 ? null : c.free[pick(c.free.length)]!.id,
    turn: 1,
  }),
  (c, pick) =>
    c.pending.length > 0 ? { kind: 'win', sighting: c.pending[pick(c.pending.length)]!.id, faction: c.faction } : null,
  (c, pick) =>
    c.pending.length > 0 && c.free.length > 0
      ? { kind: 'name', sighting: c.pending[pick(c.pending.length)]!.id, card: c.free[pick(c.free.length)]!.id }
      : null,
  (c, pick) => (c.pending.length > 0 ? { kind: 'pass', sighting: c.pending[pick(c.pending.length)]!.id } : null),
  (c, pick) => (c.pending.length > 0 ? { kind: 'cancel', sighting: c.pending[pick(c.pending.length)]!.id } : null),
];

function randomAction(state: TrackerState, pick: Pick): TrackerAction | null {
  const c = choices(state, pick);
  return STEPS[pick(STEPS.length)]!(c, pick);
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
  const onBidCards = state.seen.flatMap((sighting) =>
    sighting.card && awaitingWinner(state, sighting) ? [sighting.card] : []
  );
  expect(new Set(onBidCards).size).toBe(onBidCards.length);
  expect(drawPile(state).count).toBeGreaterThanOrEqual(0);
}

const pendingIds = (state: TrackerState) =>
  new Set(state.seen.filter((sighting) => awaitingWinner(state, sighting)).map((sighting) => sighting.id));

/* Only a bid or a take-back may open an auction that was not open before. */
function checkOpened(before: TrackerState, action: TrackerAction, after: TrackerState, where: string) {
  if (action.kind === 'bid' || action.kind === 'undo') {
    return;
  }
  const open = pendingIds(before);
  const reopened = [...pendingIds(after)].filter((id) => !open.has(id));
  expect(reopened, `${where}: ${action.kind} reopened an auction`).toEqual([]);
}

/* Runs one seed's sequence and answers how many actions it applied. */
function runSeed(seed: number): number {
  const pick = seeded(seed);
  let applied = 0;
  let state = newTracker(DECK, ['atreides', 'emperor', 'harkonnen']);
  for (let step = 0; step < 60; step += 1) {
    const action = randomAction(state, pick);
    if (action) {
      const next = trackerReducer(state, action);
      checkInvariants(next);
      checkOpened(state, action, next, `seed ${seed}, step ${step}`);
      state = next;
      applied += 1;
    }
  }
  return applied;
}

test('no sequence of actions breaks the tracker, and only a bid or a take-back opens an auction', () => {
  for (let seed = 1; seed <= 200; seed += 1) {
    expect(runSeed(seed)).toBeGreaterThan(0);
  }
});

test('the next-bid chooser never offers a copy already on bid; a hand still may take it', () => {
  const state = run({ kind: 'bid', card: 'shield#1', turn: 1 });
  const forBid = chooserCards(state, true);
  expect(forBid.seen).toEqual([]);
  expect(forBid.byName.find((entry) => entry.copy.def.key === 'shield')).toMatchObject({
    copy: { id: 'shield#2' },
    left: 1,
  });
  expect(chooserCards(state, false).seen.map((copy) => copy.id)).toEqual(['shield#1']);
});

test('a card nobody bid on goes back to the deck and its auction ends', () => {
  const state = run({ kind: 'bid', card: 'lasgun#1', turn: 1 }, { kind: 'pass', sighting: 'bid-1' });
  expect(onBid(state)).toBeUndefined();
  expect(placeOf(state, 'lasgun#1').at).toBe('deck');
  expect(drawPile(state).copies.map((copy) => copy.id)).toContain('lasgun#1');
});

test('a card put up for bid by mistake is forgotten, and a settled auction cannot be', () => {
  expect(run({ kind: 'bid', card: null, turn: 1 }, { kind: 'cancel', sighting: 'bid-1' }).seen).toEqual([]);
  const won = run(
    { kind: 'bid', card: null, turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'cancel', sighting: 'bid-1' }
  );
  expect(won.seen).toHaveLength(1);
});

test('the unknown card on bid can be named, but only as a copy still in the deck and not on bid', () => {
  const named = run({ kind: 'bid', card: null, turn: 1 }, { kind: 'name', sighting: 'bid-1', card: 'lasgun#1' });
  expect(onBid(named)?.card).toBe('lasgun#1');
  const taken = run(
    { kind: 'add', faction: 'emperor', card: 'lasgun#1' },
    { kind: 'bid', card: null, turn: 1 },
    { kind: 'name', sighting: 'bid-2', card: 'lasgun#1' }
  );
  expect(onBid(taken)?.card).toBeNull();
});

test('a winner taken back as a mistake leaves the card it was named as on bid, in the deck', () => {
  const state = run(
    { kind: 'place', card: 'lasgun#1', at: 'discard' },
    { kind: 'bid', card: null, turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'identify', faction: 'emperor', slot: 'slot-2', card: 'lasgun#1' },
    { kind: 'undo', faction: 'emperor', slot: 'slot-2' }
  );
  expect(onBid(state)?.card).toBe('lasgun#1');
  expect(placeOf(state, 'lasgun#1').at).toBe('deck');
  expect(state.hands.emperor).toEqual([]);
});

test('a card given on and taken back returns to the hand that gave it, still won at its auction', () => {
  const state = run(
    { kind: 'bid', card: null, turn: 1 },
    { kind: 'win', sighting: 'bid-1', faction: 'emperor' },
    { kind: 'give', faction: 'emperor', slot: 'slot-2', to: 'atreides' },
    { kind: 'undo', faction: 'atreides', slot: 'slot-2' }
  );
  expect(state.hands.emperor).toEqual([{ id: 'slot-2', card: null }]);
  expect(state.hands.atreides).toEqual([]);
  expect(onBid(state)).toBeUndefined();
});

test('taking back a chain of moves walks a card back to the discard pile it started in', () => {
  const state = run(
    { kind: 'place', card: 'lasgun#1', at: 'discard' },
    { kind: 'add', faction: 'emperor', card: 'lasgun#1' },
    { kind: 'add', faction: 'atreides', card: 'lasgun#1' },
    { kind: 'undo', faction: 'atreides', slot: 'slot-2' },
    { kind: 'undo', faction: 'emperor', slot: 'slot-1' }
  );
  expect(placeOf(state, 'lasgun#1').at).toBe('discard');
  expect(Object.values(state.hands).flat()).toEqual([]);
});
