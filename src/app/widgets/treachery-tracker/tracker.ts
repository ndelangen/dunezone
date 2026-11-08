/*
 * The Atreides Treachery tracker's knowledge: a private copy of the Treachery deck, and where Atreides believes each card went.
 * It records only what the player tells it, so it never knows more than Atreides saw.
 * Every view of the tracker reads this one state; the views differ only in how they show it and how a card is assigned.
 */

/** A card's kind, from the line under its name: what it does in a battle plan. */
export type CardKind = 'weapon' | 'defense' | 'special' | 'worthless';

export const CARD_KINDS: readonly CardKind[] = ['weapon', 'defense', 'special', 'worthless'];

export const KIND_LABEL: Readonly<Record<CardKind, string>> = {
  weapon: 'Weapons',
  defense: 'Defenses',
  special: 'Specials',
  worthless: 'Worthless',
};

/** A group's name for a count of its cards: "1 poison defense", "2 poison defenses". */
export function groupCount(group: CardGroup, count: number): string {
  const label = GROUP_LABEL[group].toLowerCase();
  return `${count} ${count === 1 && label.endsWith('s') ? label.slice(0, -1) : label}`;
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

/** A place in a faction's hand: a card Atreides knows, or one it only knows is there (`card` null). */
export type Slot = Readonly<{ id: string; card: string | null }>;

/**
 * A card that came up for bid, newest first, and in which turn: one Atreides looked at, or an unknown one (`card` null).
 * `slot` is the hand slot the winner got it in, which names it later if it was unknown.
 */
export type Sighting = Readonly<{ id: string; turn: number; card: string | null; slot?: string }>;

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
  /** The card leaves the hand for the discard pile; an unknown one simply leaves. */
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
export function deckCopies(defs: readonly CardDef[]): CardCopy[] {
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

export function unknownCount(state: TrackerState, faction: string): number {
  return (state.hands[faction] ?? []).filter((slot) => slot.card === null).length;
}

/** How many unplaced cards of each kind are left, which is what an unknown card could be. */
export function kindCounts(copies: readonly CardCopy[]): Record<CardKind, number> {
  const counts: Record<CardKind, number> = { weapon: 0, defense: 0, special: 0, worthless: 0 };
  for (const copy of copies) {
    counts[copy.def.kind] += 1;
  }
  return counts;
}

/**
 * The chance that at least one of `draws` unknown cards is of the matching kind, drawn from `pool` cards of which `matching` qualify.
 * Unknown cards are drawn without replacement from the cards Atreides has not placed.
 */
export function chanceOfAny(pool: number, matching: number, draws: number): number {
  if (draws <= 0 || matching <= 0) {
    return 0;
  }
  if (draws > pool - matching) {
    return 1;
  }
  let none = 1;
  for (let index = 0; index < draws; index += 1) {
    none *= (pool - matching - index) / (pool - index);
  }
  return 1 - none;
}

function withoutCard(state: TrackerState, card: string): TrackerState {
  return {
    ...state,
    hands: Object.fromEntries(
      Object.entries(state.hands).map(([faction, slots]) => [faction, slots.filter((slot) => slot.card !== card)])
    ),
    discard: state.discard.filter((entry) => entry !== card),
  };
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

export function trackerReducer(state: TrackerState, action: TrackerAction): TrackerState {
  switch (action.kind) {
    case 'add': {
      const cleared = action.card ? withoutCard(state, action.card) : state;
      const slot = { id: `slot-${state.nextSlot}`, card: action.card };
      return { ...updateHand(cleared, action.faction, (slots) => [...slots, slot]), nextSlot: state.nextSlot + 1 };
    }
    case 'identify': {
      const cleared = withoutCard(state, action.card);
      return updateHand(cleared, action.faction, (slots) =>
        slots.map((slot) => (slot.id === action.slot ? { ...slot, card: action.card } : slot))
      );
    }
    case 'discard': {
      const slot = findSlot(state, action.faction, action.slot);
      const next = updateHand(state, action.faction, (slots) => slots.filter((entry) => entry.id !== action.slot));
      return slot.card ? { ...next, discard: [...next.discard, slot.card] } : next;
    }
    case 'give': {
      const slot = findSlot(state, action.faction, action.slot);
      const next = updateHand(state, action.faction, (slots) => slots.filter((entry) => entry.id !== action.slot));
      return updateHand(next, action.to, (slots) => [...slots, slot]);
    }
    case 'undo':
      return updateHand(state, action.faction, (slots) => slots.filter((entry) => entry.id !== action.slot));
    case 'place': {
      const cleared = withoutCard(state, action.card);
      return action.at === 'discard' ? { ...cleared, discard: [...cleared.discard, action.card] } : cleared;
    }
    case 'reshuffle':
      return { ...state, discard: [] };
    case 'bid':
      return {
        ...state,
        seen: [{ id: `bid-${state.nextSlot}`, turn: action.turn, card: action.card }, ...state.seen],
        nextSlot: state.nextSlot + 1,
      };
    case 'win': {
      const sighting = state.seen.find((entry) => entry.id === action.sighting);
      if (!sighting) {
        throw new Error(`Nothing came up for bid as ${action.sighting}.`);
      }
      const slot = `slot-${state.nextSlot}`;
      const added = trackerReducer(state, { kind: 'add', faction: action.faction, card: sighting.card });
      return {
        ...added,
        seen: added.seen.map((entry) => (entry.id === sighting.id ? { ...entry, slot } : entry)),
      };
    }
    case 'note':
      return { ...state, notes: { ...state.notes, [action.faction]: action.text.slice(0, 120) } };
  }
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
  if (sighting.slot) {
    return false;
  }
  return sighting.card === null || placeOf(state, sighting.card).at === 'deck';
}

/** The turn the tracker is in: the turn of the newest card on bid. */
export function currentTurn(state: TrackerState): number {
  return state.seen[0]?.turn ?? 1;
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
 * A card's group, read from its subtitle. A weapon or defense that names neither poison nor projectile
 * (the Lasgun, Weirding Way) joins the projectile side: Weirding Way counts as a projectile weapon, and the Lasgun is a gun.
 */
export function groupOf(def: CardDef): CardGroup {
  if (def.kind === 'weapon' || def.kind === 'defense') {
    return `${def.kind}-${/\bPoison\b/.test(def.detail) ? 'poison' : 'projectile'}`;
  }
  return def.kind;
}
