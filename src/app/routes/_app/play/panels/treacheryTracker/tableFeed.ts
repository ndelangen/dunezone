/*
 * The Treachery tracker filling itself in from the table (#2794): what the viewer's seat can see, turned into tracker entries.
 * It reads only what this seat already sees (its own peeks and hand, the bidder, the public hand counts and face-up cards),
 * so the tracker still never knows more than Atreides saw.
 * Every step is idempotent: the state remembers which table cards and auctions it already followed, so reading the same table twice,
 * or again after a reload, changes nothing.
 */
import { onBid, reservedCards, trackerReducer, unplaced } from './tracker';
import type { CardCopy, TrackerAction, TrackerState } from './tracker';

/** A card on the table as the viewer sees it: the table's item id and the face it shows. */
export type SeenCard = Readonly<{ item: string; face: string }>;

/** What the table shows this seat, reduced to what the tracker follows. */
export type TableFacts = Readonly<{
  /** The turn the table is in, which a new auction is filed under. */
  turn: number;
  /** A single face-down Treachery card the viewer's faction holds open in the Bidding phase: the card up for bid. */
  peek: SeenCard | null;
  /** How the bidder's last round ended, under a key that names it once in the game; null while a round runs or before one. */
  round: Readonly<{ key: string; winner: string | null }> | null;
  /** How many Treachery cards each faction holds, as the rules make public. */
  counts: Readonly<Record<string, number>>;
  /** The Treachery cards lying face up on the table, outside a battle: the discard pile, as far as the tracker knows. */
  discards: readonly SeenCard[];
  /** The viewer's own faction and the Treachery cards in its hand, whose faces it sees. */
  own: Readonly<{ faction: string; cards: readonly SeenCard[] }> | null;
}>;

/** What the tracker already followed: table cards by item id, each with the copy it stood for, and the auctions it settled. */
export type TableMemory = Readonly<{
  peeked: readonly string[];
  settled: readonly string[];
  discarded: Readonly<Record<string, string>>;
  own: Readonly<Record<string, string>>;
}>;

const EMPTY_MEMORY: TableMemory = { peeked: [], settled: [], discarded: {}, own: {} };
/* A game sees a few dozen auctions; the newest keys are enough to never follow one twice. */
const MEMORY_LIMIT = 200;

type Followed = Readonly<{ state: TrackerState; memory: TableMemory }>;

const apply = (state: TrackerState, action: TrackerAction) => trackerReducer(state, action);
const recent = (keys: readonly string[], key: string) => [...keys, key].slice(-MEMORY_LIMIT);

/* The copies of the card with this face, in the deck's order. */
function copiesOf(state: TrackerState, face: string): CardCopy[] {
  return state.copies.filter((copy) => copy.def.face === face);
}

/* A copy of this card still in the draw pile: not placed anywhere and not on bid. */
function freeCopy(state: TrackerState, face: string): string | undefined {
  const reserved = reservedCards(state);
  const free = new Set(unplaced(state).map((copy) => copy.id));
  return copiesOf(state, face).find((copy) => free.has(copy.id) && !reserved.has(copy.id))?.id;
}

/* The copy of this card waiting on bid, which a hand that turns out to hold it takes. */
function copyOnBid(state: TrackerState, face: string): string | undefined {
  const reserved = reservedCards(state);
  return copiesOf(state, face).find((copy) => reserved.has(copy.id))?.id;
}

/* Where a known copy sits in a hand. */
function heldAt(state: TrackerState, card: string): { faction: string; slot: string } | undefined {
  for (const [faction, slots] of Object.entries(state.hands)) {
    const slot = slots.find((entry) => entry.card === card);
    if (slot) {
      return { faction, slot: slot.id };
    }
  }
  return undefined;
}

/* The factions the tracker gives more cards than the table says they hold. */
function overfull(state: TrackerState, counts: TableFacts['counts']): string[] {
  return Object.keys(state.hands).filter(
    (faction) => counts[faction] !== undefined && state.hands[faction]!.length > counts[faction]!
  );
}

/* A peek at the card up for bid puts it up for bid, once per table card. */
function followPeek({ state, memory }: Followed, facts: TableFacts): Followed {
  const { peek } = facts;
  if (!peek || memory.peeked.includes(peek.item)) {
    return { state, memory };
  }
  const card = freeCopy(state, peek.face);
  const next = card ? apply(state, { kind: 'bid', card, turn: facts.turn }) : state;
  return { state: next, memory: { ...memory, peeked: recent(memory.peeked, peek.item) } };
}

/* A round the bidder ended settles the card on bid: the winner takes it, or nobody bid and it goes back. */
function followRound({ state, memory }: Followed, facts: TableFacts): Followed {
  const { round } = facts;
  if (!round || memory.settled.includes(round.key)) {
    return { state, memory };
  }
  const auction = onBid(state);
  let next = state;
  if (auction) {
    next = round.winner
      ? apply(state, { kind: 'win', sighting: auction.id, faction: round.winner })
      : apply(state, { kind: 'pass', sighting: auction.id });
  }
  return { state: next, memory: { ...memory, settled: recent(memory.settled, round.key) } };
}

/* A card of the viewer's own hand, named: a slot already naming that card, else an unknown slot, else a new slot. */
function ownCard(state: TrackerState, faction: string, face: string, taken: ReadonlySet<string>) {
  const slots = state.hands[faction] ?? [];
  const copies = new Set(copiesOf(state, face).map((copy) => copy.id));
  const named = slots.find((slot) => slot.card && !taken.has(slot.card) && copies.has(slot.card));
  if (named?.card) {
    return { state, card: named.card };
  }
  const card = copyOnBid(state, face) ?? freeCopy(state, face);
  if (!card) {
    return { state, card: undefined };
  }
  const unknown = slots.find((slot) => slot.card === null);
  const next = unknown
    ? apply(state, { kind: 'identify', faction, slot: unknown.id, card })
    : apply(state, { kind: 'add', faction, card });
  return { state: next, card };
}

/* The viewer sees its own hand, so every card in it is named. */
function followOwnHand({ state, memory }: Followed, facts: TableFacts): Followed {
  const { own } = facts;
  if (!own || !state.hands[own.faction]) {
    return { state, memory };
  }
  let next = state;
  const mapped: Record<string, string> = {};
  const taken = new Set<string>();
  for (const { item, face } of own.cards) {
    const known = memory.own[item];
    if (known && heldAt(next, known)?.faction === own.faction) {
      mapped[item] = known;
      taken.add(known);
      continue;
    }
    const named = ownCard(next, own.faction, face, taken);
    next = named.state;
    if (named.card) {
      mapped[item] = named.card;
      taken.add(named.card);
    }
  }
  /* A card that left the hand keeps its name, so the copy it stood for is the one a face-up card on the table is. */
  return { state: next, memory: { ...memory, own: { ...memory.own, ...mapped } } };
}

/*
 * Which copy a card newly face up on the table is: the viewer's own card it played; a copy the tracker gives a faction
 * holding fewer cards than it thinks; an unknown card of such a faction, now named; else a copy from the deck or wherever it is known.
 */
function discardedCopy(
  state: TrackerState,
  seen: SeenCard,
  facts: TableFacts,
  memory: TableMemory
): Followed & { card?: string } {
  const own = memory.own[seen.item];
  if (own) {
    return { state, memory, card: own };
  }
  const copies = new Set(copiesOf(state, seen.face).map((copy) => copy.id));
  for (const faction of overfull(state, facts.counts)) {
    const known = state.hands[faction]!.find((slot) => slot.card && copies.has(slot.card));
    if (known?.card) {
      return { state, memory, card: known.card };
    }
  }
  const free = freeCopy(state, seen.face);
  for (const faction of overfull(state, facts.counts)) {
    const unknown = state.hands[faction]!.find((slot) => slot.card === null);
    if (unknown && free) {
      return { state: apply(state, { kind: 'identify', faction, slot: unknown.id, card: free }), memory, card: free };
    }
  }
  const elsewhere = [...copies].find((card) => heldAt(state, card) !== undefined && !state.discard.includes(card));
  return { state, memory, card: free ?? elsewhere };
}

/* A Treachery card lying face up on the table was played or discarded: it goes to the discard pile, once per table card. */
function followDiscards({ state, memory }: Followed, facts: TableFacts): Followed {
  let next = state;
  let discarded = { ...memory.discarded };
  for (const seen of facts.discards) {
    if (discarded[seen.item]) {
      continue;
    }
    const placed = discardedCopy(next, seen, facts, memory);
    next = placed.state;
    if (placed.card) {
      next = apply(next, { kind: 'place', card: placed.card, at: 'discard' });
      discarded = { ...discarded, [seen.item]: placed.card };
    }
  }
  return { state: next, memory: { ...memory, discarded } };
}

/*
 * Every card the tracker followed onto the discard pile left the table's face-up cards at once: the pile was shuffled back into the deck.
 * Cards that left one by one, such as a card taken back, stay where the tracker put them.
 */
function followReshuffle({ state, memory }: Followed, facts: TableFacts): Followed {
  const followed = Object.keys(memory.discarded);
  const showing = new Set(facts.discards.map((seen) => seen.item));
  if (followed.length === 0 || followed.some((item) => showing.has(item))) {
    return { state, memory };
  }
  return { state: apply(state, { kind: 'reshuffle' }), memory: { ...memory, discarded: {} } };
}

/* A faction holding more Treachery cards than the tracker shows drew the rest: they join its hand as unknown cards. */
function followCounts({ state, memory }: Followed, facts: TableFacts): Followed {
  let next = state;
  for (const [faction, count] of Object.entries(facts.counts)) {
    const held = next.hands[faction]?.length;
    for (let missing = held === undefined ? 0 : count - held; missing > 0; missing -= 1) {
      next = apply(next, { kind: 'add', faction, card: null });
    }
  }
  return { state: next, memory };
}

/**
 * The tracker after reading the table once more: the bidder first, so a round that ended before a peek never takes the card it shows, then peeks, the viewer's hand, face-up cards and a reshuffle, and last the hand counts, so a card the table already explains never also arrives as an unknown one.
 */
export function followTable(state: TrackerState, memory: TableMemory | undefined, facts: TableFacts): Followed {
  return [followRound, followPeek, followOwnHand, followReshuffle, followDiscards, followCounts].reduce(
    (followed, step) => step(followed, facts),
    { state, memory: memory ?? EMPTY_MEMORY }
  );
}

/** The factions the tracker gives more Treachery cards than the table shows: a card left their hand that the tracker could not follow. */
export function unfollowedLosses(state: TrackerState, counts: TableFacts['counts']): Record<string, number> {
  return Object.fromEntries(
    overfull(state, counts).map((faction) => [faction, state.hands[faction]!.length - counts[faction]!])
  );
}
