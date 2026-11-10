/*
 * The one entry the table makes in the Treachery tracker by itself (#2794): Atreides peeking at the card up for bid puts that card up for bid.
 * Everything else, who won it, where cards went and what a hand holds, is the player's own work and judgement.
 * A peek is followed once per table card and turn, which is once per auction: reading the same table again, or after a reload, changes nothing,
 * and a card dismissed as never up for bid stays dismissed for that auction.
 * A card nobody bought goes back to the deck, and when it comes up again in a later turn its peek is a new auction.
 */
import {
  awaitingWinner,
  copyOf,
  onBid,
  reservedCards,
  trackerReducer,
  unplaced,
} from '@app/widgets/treachery-tracker/tracker';
import type { TrackerState } from '@app/widgets/treachery-tracker/tracker';

/** A card on the table as the viewer sees it: the table's item id and the face it shows. */
type SeenCard = Readonly<{ item: string; face: string }>;

/** What the table shows this seat, reduced to what the tracker follows. */
export type TableFacts = Readonly<{
  /** The turn the table is in, which a new auction is filed under. */
  turn: number;
  /** A single face-down Treachery card the viewer's faction holds open in the Bidding phase: the card up for bid. */
  peek: SeenCard | null;
}>;

/**
 * The auctions the tracker already followed, by table item id and turn (`item@turn`).
 * `sightings` are the auctions a peek accounts for: the ones it put up for bid, and the ones the player had already entered by hand.
 */
export type TableMemory = Readonly<{ peeked: readonly string[]; sightings?: readonly string[] }>;

/* A game sees a few dozen auctions; the newest are enough to never follow one twice. */
const MEMORY_LIMIT = 200;

/* A copy of the card with this face still in the draw pile: not placed anywhere and not on bid. */
function freeCopy(state: TrackerState, face: string): string | undefined {
  const reserved = reservedCards(state);
  const free = new Set(unplaced(state).map((copy) => copy.id));
  return state.copies.find((copy) => copy.def.face === face && free.has(copy.id) && !reserved.has(copy.id))?.id;
}

type Followed = Readonly<{ state: TrackerState; memory: TableMemory | undefined }>;

/* An auction the player already put up for bid by hand this turn, with this face, that no peek accounts for yet. */
function enteredByHand(state: TrackerState, turn: number, face: string, accounted: readonly string[]) {
  return state.seen.find((sighting) => {
    if (!sighting.card || sighting.turn !== turn || accounted.includes(sighting.id)) {
      return false;
    }
    return awaitingWinner(state, sighting) && copyOf(state, sighting.card).def.face === face;
  });
}

/* The unknown card on bid this turn, put up by hand before the peek: the card peeked at names it. */
function unknownOnBid(state: TrackerState, turn: number) {
  const sighting = onBid(state);
  return sighting?.turn === turn && sighting.card === null ? sighting : undefined;
}

/* The peeked card put up for bid, or naming the unknown card on bid; the same tracker when it refuses, and the auction it is. */
function putUp(state: TrackerState, turn: number, card: string): { next: TrackerState; sighting?: string } {
  const unknown = unknownOnBid(state, turn);
  if (unknown) {
    const next = trackerReducer(state, { kind: 'name', sighting: unknown.id, card });
    return { next, sighting: next === state ? undefined : unknown.id };
  }
  const next = trackerReducer(state, { kind: 'bid', card, turn });
  return { next, sighting: next === state ? undefined : next.seen[0]?.id };
}

/**
 * The tracker after reading the table once more: a peek at a card it has not followed yet puts that card up for bid, or names the unknown card already on bid.
 * A read that puts nothing up for bid hands back the same tracker and memory, so nothing is saved for it;
 * a peek at a card with no copy left, or a bid the tracker refuses, is tried again on the next read.
 */
export function followTable(
  state: TrackerState,
  memory: TableMemory | undefined,
  { turn, peek }: TableFacts
): Followed {
  const unchanged = { state, memory };
  if (!peek) {
    return unchanged;
  }
  const auction = `${peek.item}@${turn}`;
  const peeked = memory?.peeked ?? [];
  const accounted = memory?.sightings ?? [];
  if (peeked.includes(auction)) {
    return unchanged;
  }
  const followed = (next: TrackerState, sighting: string): Followed => ({
    state: next,
    memory: {
      peeked: [...peeked, auction].slice(-MEMORY_LIMIT),
      sightings: [...accounted, sighting].slice(-MEMORY_LIMIT),
    },
  });
  /* A card the player already put up for bid is that auction, not a second one. */
  const entered = enteredByHand(state, turn, peek.face, accounted);
  if (entered) {
    return followed(state, entered.id);
  }
  const card = freeCopy(state, peek.face);
  const { next, sighting } = card ? putUp(state, turn, card) : { next: state, sighting: undefined };
  return sighting ? followed(next, sighting) : unchanged;
}
