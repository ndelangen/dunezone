/*
 * The Atreides Treachery tracker's knowledge: a private copy of the Treachery deck, and where Atreides believes each card went.
 * It records only what the player tells it, so it never knows more than Atreides saw.
 * Every view of the tracker reads this one state; the views differ only in how they show it and how a card is assigned.
 */

/** A card's kind, from the line under its name: what it does in a battle plan. */
export type CardKind = 'weapon' | 'defense' | 'special' | 'worthless';

export const CARD_KINDS: readonly CardKind[] = ['weapon', 'defense', 'special', 'worthless'];

const GROUP_ONE: Readonly<Record<CardGroup, string>> = {
  'weapon-poison': 'poison weapon',
  'weapon-projectile': 'projectile weapon',
  'defense-poison': 'poison defense',
  'defense-projectile': 'projectile defense',
  special: 'special',
  worthless: 'worthless',
};

/** A group's name for a count of its cards: "1 poison defense", "2 poison defenses", "1 worthless". */
export function groupCount(group: CardGroup, count: number): string {
  return `${count} ${count === 1 ? GROUP_ONE[group] : GROUP_LABEL[group].toLowerCase()}`;
}

/** One card of the deck as the ruleset defines it, with how many copies the deck holds. */
export type CardDef = Readonly<{
  key: string;
  name: string;
  kind: CardKind;
  /** The card's subtitle, such as "Weapon - Poison". */
  detail: string;
  /** The card's face. */
  face: string;
  count: number;
}>;

/** One physical card: a definition and which of its copies this is. */
export type CardCopy = Readonly<{ id: string; def: CardDef; copy: number }>;

/** Where a known card was before it went into a slot, so taking the slot back as a mistake returns it there. */
type Origin = Readonly<{ at: 'discard' } | { at: 'hand'; faction: string; slot: string }>;

/**
 * A place in a faction's hand: a card Atreides knows, or one it only knows is there (`card` null).
 * `from` is where the card was before, when that was not the deck.
 */
export type Slot = Readonly<{ id: string; card: string | null; from?: Origin }>;

/**
 * A card that came up for bid, newest first, and in which turn: one Atreides looked at, or an unknown one (`card` null).
 * `slot` is the hand slot the winner got it in, which names it later if it was unknown.
 * `done` marks an auction that ended, whichever way: once its card leaves the winner's hand, or goes straight to the discard pile.
 */
export type Sighting = Readonly<{ id: string; turn: number; card: string | null; slot?: string; done?: true }>;

export type TrackerState = Readonly<{
  copies: readonly CardCopy[];
  /** Every faction's hand as Atreides knows it, in seat order. */
  hands: Readonly<Record<string, readonly Slot[]>>;
  /** Cards known to be discarded, oldest first. */
  discard: readonly string[];
  /** Cards Atreides saw, newest first: the auction cards, and anything else it peeked at. */
  seen: readonly Sighting[];
  /** A line Atreides keeps on each faction, such as what it knows that faction cannot have. */
  notes: Readonly<Record<string, string>>;
  nextSlot: number;
}>;

export type TrackerAction =
  /** A faction gains a card: a known one, wherever it was, or an unknown one. */
  | Readonly<{ kind: 'add'; faction: string; card: string | null }>
  /** An unknown card in a hand turns out to be this one. */
  | Readonly<{ kind: 'identify'; faction: string; slot: string; card: string }>
  /** The card leaves the hand for the discard pile; an unknown one leaves without a name. */
  | Readonly<{ kind: 'discard'; faction: string; slot: string }>
  /** The card passes from one hand to another, known or not. */
  | Readonly<{ kind: 'give'; faction: string; slot: string; to: string }>
  /** The slot was a mistake: the card goes back to where it came from. */
  | Readonly<{ kind: 'undo'; faction: string; slot: string }>
  /** A known card goes straight to the discard pile, or back to the deck, from wherever it is. */
  | Readonly<{ kind: 'place'; card: string; at: 'deck' | 'discard' }>
  /** The discard pile is shuffled back into the deck. */
  | Readonly<{ kind: 'reshuffle' }>
  /** A card comes up for bid: one Atreides looked at, or an unknown one. */
  | Readonly<{ kind: 'bid'; card: string | null; turn: number }>
  /** A faction won the card on bid: a known card goes to its hand by name, an unknown one as an unknown card. */
  | Readonly<{ kind: 'win'; sighting: string; faction: string }>
  /** Atreides's line on a faction. */
  | Readonly<{ kind: 'note'; faction: string; text: string }>;

/** Every copy of a deck, in the deck's order. */
function deckCopies(defs: readonly CardDef[]): CardCopy[] {
  return defs.flatMap((def) =>
    Array.from({ length: def.count }, (_, index) => ({ id: `${def.key}#${index + 1}`, def, copy: index + 1 }))
  );
}

/** A tracker at the start of a game: the whole deck, and every faction's hand empty. */
export function newTracker(defs: readonly CardDef[], factions: readonly string[]): TrackerState {
  return {
    copies: deckCopies(defs),
    hands: Object.fromEntries(factions.map((faction) => [faction, []])),
    discard: [],
    seen: [],
    notes: {},
    nextSlot: 1,
  };
}

/** Where a copy is, as far as Atreides knows. */
export type Place = Readonly<{ at: 'deck' } | { at: 'discard' } | { at: 'hand'; faction: string; slot: string }>;

export function placeOf(state: TrackerState, card: string): Place {
  for (const [faction, slots] of Object.entries(state.hands)) {
    const slot = slots.find((entry) => entry.card === card);
    if (slot) {
      return { at: 'hand', faction, slot: slot.id };
    }
  }
  return state.discard.includes(card) ? { at: 'discard' } : { at: 'deck' };
}

/** The cards Atreides has not placed anywhere: the draw pile, and every unknown card in a hand, came from these. */
export function unplaced(state: TrackerState): CardCopy[] {
  const placed = new Set<string>(state.discard);
  for (const slots of Object.values(state.hands)) {
    for (const slot of slots) {
      if (slot.card) {
        placed.add(slot.card);
      }
    }
  }
  return state.copies.filter((copy) => !placed.has(copy.id));
}

export function copyOf(state: TrackerState, card: string): CardCopy {
  const copy = state.copies.find((entry) => entry.id === card);
  if (!copy) {
    throw new Error(`No card ${card} in this deck.`);
  }
  return copy;
}

/*
 * A card on bid that was won into a slot names its card through that slot.
 * When the slot leaves its hand, the sighting keeps the slot's card by name and lets go of the slot;
 * a slot taken back as a mistake returns the card to waiting for its winner.
 */
function releaseSlots(state: TrackerState, slots: ReadonlySet<string>, mistake = false): TrackerState {
  const holds = (sighting: Sighting) => sighting.slot !== undefined && slots.has(sighting.slot);
  if (!state.seen.some(holds)) {
    return state;
  }
  const cards = new Map(
    Object.values(state.hands)
      .flat()
      .map((slot) => [slot.id, slot.card])
  );
  return {
    ...state,
    seen: state.seen.map((sighting) => {
      if (!holds(sighting)) {
        return sighting;
      }
      const { slot = '', ...rest } = sighting;
      return mistake ? rest : { ...rest, card: cards.get(slot) ?? sighting.card, done: true };
    }),
  };
}

function withoutCard(state: TrackerState, card: string): TrackerState {
  const holding = new Set(
    Object.values(state.hands)
      .flat()
      .filter((slot) => slot.card === card)
      .map((slot) => slot.id)
  );
  const released = releaseSlots(state, holding);
  return {
    ...released,
    hands: Object.fromEntries(
      Object.entries(released.hands).map(([faction, slots]) => [faction, slots.filter((slot) => slot.card !== card)])
    ),
    discard: released.discard.filter((entry) => entry !== card),
  };
}

/* Where a known card is now, as the origin a slot that takes it remembers; the deck needs no memory. */
function originOf(state: TrackerState, card: string): Origin | undefined {
  const place = placeOf(state, card);
  return place.at === 'deck' ? undefined : place;
}

/* The auction a card settles: the oldest one still waiting on that card. */
function waitingFor(state: TrackerState, card: string): Sighting | undefined {
  return state.seen.findLast((sighting) => sighting.card === card && awaitingWinner(state, sighting));
}

function updateSighting(state: TrackerState, id: string, change: (sighting: Sighting) => Sighting): TrackerState {
  return { ...state, seen: state.seen.map((sighting) => (sighting.id === id ? change(sighting) : sighting)) };
}

/* A slot taken back as a mistake: its card returns to where it was, into the deck when it came from there. */
function restoreOrigin(state: TrackerState, slot: Slot): TrackerState {
  const { card, from } = slot;
  if (!card || !from) {
    return state;
  }
  if (from.at === 'discard') {
    return { ...state, discard: [...state.discard, card] };
  }
  return updateHand(state, from.faction, (slots) => [...slots, { id: from.slot, card }]);
}

function updateHand(state: TrackerState, faction: string, change: (slots: readonly Slot[]) => readonly Slot[]) {
  return { ...state, hands: { ...state.hands, [faction]: change(state.hands[faction] ?? []) } };
}

function findSlot(state: TrackerState, faction: string, slot: string): Slot {
  const found = state.hands[faction]?.find((entry) => entry.id === slot);
  if (!found) {
    throw new Error(`No slot ${slot} in ${faction}'s hand.`);
  }
  return found;
}

type ActionOf<K extends TrackerAction['kind']> = Extract<TrackerAction, { kind: K }>;
type Handlers = { readonly [K in TrackerAction['kind']]: (state: TrackerState, action: ActionOf<K>) => TrackerState };

/* A known card going into a hand: it leaves wherever it was, and the slot remembers where that was. */
function addKnown(state: TrackerState, faction: string, card: string): TrackerState {
  const id = `slot-${state.nextSlot}`;
  const from = originOf(state, card);
  /* A card on bid that goes into a hand is that auction's winner, by whichever button. */
  const auction = waitingFor(state, card);
  const slot: Slot = from ? { id, card, from } : { id, card };
  const added = {
    ...updateHand(withoutCard(state, card), faction, (slots) => [...slots, slot]),
    nextSlot: state.nextSlot + 1,
  };
  return auction ? settleAuction(added, auction.id, id) : added;
}

/*
 * A card on bid turned up in a slot: that slot won its auction.
 * Two auctions may name one slot (an unknown card won, then named as a card seen on bid), and both follow it.
 */
function settleAuction(state: TrackerState, auction: string, slot: string): TrackerState {
  return updateSighting(state, auction, (entry) => ({ ...entry, slot }));
}

function addUnknown(state: TrackerState, faction: string): TrackerState {
  const slot: Slot = { id: `slot-${state.nextSlot}`, card: null };
  return { ...updateHand(state, faction, (slots) => [...slots, slot]), nextSlot: state.nextSlot + 1 };
}

function withoutSlot(state: TrackerState, faction: string, slot: string): TrackerState {
  return updateHand(state, faction, (slots) => slots.filter((entry) => entry.id !== slot));
}

function sightingOf(state: TrackerState, id: string): Sighting {
  const sighting = state.seen.find((entry) => entry.id === id);
  if (!sighting) {
    throw new Error(`Nothing came up for bid as ${id}.`);
  }
  return sighting;
}

const HANDLERS: Handlers = {
  add: (state, { faction, card }) => (card ? addKnown(state, faction, card) : addUnknown(state, faction)),
  identify: (state, { faction, slot, card }) => {
    const from = originOf(state, card);
    const auction = waitingFor(state, card);
    const named = updateHand(withoutCard(state, card), faction, (slots) =>
      slots.map((entry) => (entry.id === slot ? { ...entry, card, ...(from ? { from } : {}) } : entry))
    );
    return auction ? settleAuction(named, auction.id, slot) : named;
  },
  discard: (state, { faction, slot }) => {
    const { card } = findSlot(state, faction, slot);
    const next = withoutSlot(releaseSlots(state, new Set([slot])), faction, slot);
    return card ? { ...next, discard: [...next.discard, card] } : next;
  },
  give: (state, { faction, slot, to }) => {
    const moving = findSlot(state, faction, slot);
    return updateHand(withoutSlot(state, faction, slot), to, (slots) => [...slots, moving]);
  },
  undo: (state, { faction, slot }) => {
    const taken = findSlot(state, faction, slot);
    return restoreOrigin(withoutSlot(releaseSlots(state, new Set([slot]), true), faction, slot), taken);
  },
  place: (state, { card, at }) => {
    if (at === 'deck') {
      return withoutCard(state, card);
    }
    /* A card on bid that goes straight to the discard pile ends its auction. */
    const auction = waitingFor(state, card);
    const cleared = withoutCard(state, card);
    const placed = { ...cleared, discard: [...cleared.discard, card] };
    return auction ? updateSighting(placed, auction.id, (entry) => ({ ...entry, done: true })) : placed;
  },
  reshuffle: (state) => ({ ...state, discard: [] }),
  bid: (state, { card, turn }) => ({
    ...state,
    seen: [{ id: `bid-${state.nextSlot}`, turn, card }, ...state.seen],
    nextSlot: state.nextSlot + 1,
  }),
  win: (state, action) => {
    const { id, card } = sightingOf(state, action.sighting);
    const slot = `slot-${state.nextSlot}`;
    /* The win names its own auction, so a second copy of the same card on bid keeps waiting. */
    const unnamed = updateSighting(state, id, (entry) => ({ ...entry, card: null }));
    const added = card ? addKnown(unnamed, action.faction, card) : addUnknown(unnamed, action.faction);
    return updateSighting(added, id, (entry) => ({ ...entry, card, slot }));
  },
  note: (state, { faction, text }) => ({ ...state, notes: { ...state.notes, [faction]: text.slice(0, 120) } }),
};

export function trackerReducer(state: TrackerState, action: TrackerAction): TrackerState {
  const handle = HANDLERS[action.kind] as (state: TrackerState, action: TrackerAction) => TrackerState;
  return handle(state, action);
}

/** Where a card on bid went: the slot it was won into, wherever that slot is now. */
export function slotOf(state: TrackerState, slot: string | undefined): { faction: string; slot: Slot } | null {
  if (!slot) {
    return null;
  }
  for (const [faction, slots] of Object.entries(state.hands)) {
    const found = slots.find((entry) => entry.id === slot);
    if (found) {
      return { faction, slot: found };
    }
  }
  return null;
}

/** The card a bid was, as far as Atreides knows now: the card it saw, or what the winner's unknown card turned out to be. */
export function sightingCard(state: TrackerState, sighting: Sighting): string | null {
  return sighting.card ?? slotOf(state, sighting.slot)?.slot.card ?? null;
}

/** Whether a card on bid is still waiting for its winner. */
export function awaitingWinner(state: TrackerState, sighting: Sighting): boolean {
  if (sighting.slot || sighting.done) {
    return false;
  }
  return sighting.card === null || placeOf(state, sighting.card).at === 'deck';
}

/** The copies on bid that still wait for their winner: no other auction or hand may take them from the deck. */
export function reservedCards(state: TrackerState): Set<string> {
  return new Set(
    state.seen.flatMap((sighting) => (sighting.card && awaitingWinner(state, sighting) ? [sighting.card] : []))
  );
}

/**
 * What is left to draw as far as Atreides knows: the unplaced copies not on bid, and how many cards that is once the unknown cards in hands and on bid, which came from those copies, are taken off.
 */
export function drawPile(state: TrackerState): { copies: CardCopy[]; count: number } {
  const reserved = reservedCards(state);
  const copies = unplaced(state).filter((copy) => !reserved.has(copy.id));
  const unknownInHands = Object.values(state.hands)
    .flat()
    .filter((slot) => slot.card === null).length;
  const unknownOnBid = state.seen.filter(
    (sighting) => sighting.card === null && awaitingWinner(state, sighting)
  ).length;
  return { copies, count: Math.max(0, copies.length - unknownInHands - unknownOnBid) };
}

/** One glyph a chooser offers for a card name: the copy a pick takes, and how many copies are left. */
export type ChooserCard = { copy: CardCopy; left: number };

/**
 * What a card chooser offers: the cards seen but not placed, newest first, then the draw pile with one entry per name.
 * A copy on bid is spoken for: the draw pile offers only the other copies, and a hand takes it from the seen row, which leaves it out when picking the next card up for bid.
 */
export function chooserCards(state: TrackerState, forBid: boolean): { seen: CardCopy[]; byName: ChooserCard[] } {
  const reserved = reservedCards(state);
  const freeIds = new Set(unplaced(state).map((copy) => copy.id));
  const offered = (card: string | null): card is string =>
    card !== null && freeIds.has(card) && !(forBid && reserved.has(card));
  const seen = [...new Set(state.seen.map((sighting) => sighting.card).filter(offered))].map((card) =>
    copyOf(state, card)
  );
  const byName = new Map<string, ChooserCard>();
  for (const copy of drawPile(state).copies) {
    const entry = byName.get(copy.def.key) ?? { copy, left: 0 };
    byName.set(copy.def.key, { ...entry, left: entry.left + 1 });
  }
  return { seen, byName: [...byName.values()] };
}

/** The turn the tracker is in: the table's turn where a game supplies it, else the turn of the newest card on bid. */
export function currentTurn(state: TrackerState, tableTurn?: number): number {
  return tableTurn ?? state.seen[0]?.turn ?? 1;
}

/** The card on bid: the oldest card still waiting for its winner, since cards come up for bid in the order they were seen. */
export function onBid(state: TrackerState): Sighting | undefined {
  return state.seen.findLast((sighting) => awaitingWinner(state, sighting));
}

/** The groups the tracker sorts cards into: weapons and defenses split by what they kill or stop, then the rest by kind. */
export type CardGroup =
  | 'weapon-poison'
  | 'weapon-projectile'
  | 'defense-poison'
  | 'defense-projectile'
  | 'special'
  | 'worthless';

/** The groups in order, weapons and defenses each as a poison | projectile pair. */
export const GROUP_ROWS: readonly (readonly CardGroup[])[] = [
  ['weapon-poison', 'weapon-projectile'],
  ['defense-poison', 'defense-projectile'],
  ['special', 'worthless'],
];

export const CARD_GROUPS: readonly CardGroup[] = GROUP_ROWS.flat();

export const GROUP_LABEL: Readonly<Record<CardGroup, string>> = {
  'weapon-poison': 'Poison weapons',
  'weapon-projectile': 'Projectile weapons',
  'defense-poison': 'Poison defenses',
  'defense-projectile': 'Projectile defenses',
  special: 'Specials',
  worthless: 'Worthless',
};

/**
 * A card's group, read from its subtitle.
 * A weapon or defense that names neither poison nor projectile
 * (the Lasgun, Weirding Way) joins the projectile side: Weirding Way counts as a projectile weapon, and the Lasgun is a gun.
 */
export function groupOf(def: CardDef): CardGroup {
  if (def.kind === 'weapon' || def.kind === 'defense') {
    return `${def.kind}-${/\bPoison\b/.test(def.detail) ? 'poison' : 'projectile'}`;
  }
  return def.kind;
}
