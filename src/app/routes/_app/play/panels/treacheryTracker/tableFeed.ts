/*
 * The one entry the table makes in the Treachery tracker by itself (#2794): Atreides peeking at the card up for bid puts that card up for bid.
 * Everything else, who won it, where cards went and what a hand holds, is the player's own work and judgement.
 * A peek is followed once per table card and turn, which is once per auction: reading the same table again, or after a reload, changes nothing,
 * and a card dismissed as never up for bid stays dismissed for that auction.
 * A card nobody bought goes back to the deck, and when it comes up again in a later turn its peek is a new auction.
 */
import { awaitingWinner, copyOf, onBid, reservedCards, trackerReducer, unplaced } from './tracker';
import type { TrackerState } from './tracker';

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

/**
 * The tracker after reading the table once more: a peek at a card it has not followed yet puts that card up for bid, or names the unknown card already on bid.
 * A read that puts nothing up for bid hands back the same tracker and memory, so nothing is saved for it;
 * a peek at a card with no copy left is tried again on the next read, in case the player frees one.
 */
export function followTable(
  state: TrackerState,
  memory: TableMemory | undefined,
  { turn, peek }: TableFacts
): Readonly<{ state: TrackerState; memory: TableMemory | undefined }> {
  const peeked = memory?.peeked ?? [];
  const auction = peek ? `${peek.item}@${turn}` : null;
  if (!peek || !auction || peeked.includes(auction)) {
    return { state, memory };
  }
  const accounted = memory?.sightings ?? [];
  const followed = (next: TrackerState, sighting: string) => ({
    state: next,
    memory: {
      peeked: [...peeked, auction].slice(-MEMORY_LIMIT),
      sightings: [...accounted, sighting].slice(-MEMORY_LIMIT),
    },
  });
  /* The player already put this card up for bid by hand this turn, and no peek accounts for it yet: the peek is that auction, not a second one. */
  const entered = state.seen.find(
    (sighting) =>
      sighting.card &&
      sighting.turn === turn &&
      !accounted.includes(sighting.id) &&
      awaitingWinner(state, sighting) &&
      copyOf(state, sighting.card).def.face === peek.face
  );
  if (entered) {
    return followed(state, entered.id);
  }
  const card = freeCopy(state, peek.face);
  if (!card) {
    return { state, memory };
  }
  /* The unknown card already on bid this turn, put up by hand before the peek, is the card peeked at: it is named, not bid again. */
  const onBidNow = onBid(state);
  const unknown = onBidNow?.turn === turn ? onBidNow : undefined;
  const next = trackerReducer(
    state,
    unknown?.card === null ? { kind: 'name', sighting: unknown.id, card } : { kind: 'bid', card, turn }
  );
  /* A bid the tracker refuses, with every card already accounted for, is tried again on the next read. */
  if (next === state) {
    return { state, memory };
  }
  return followed(next, unknown?.card === null ? unknown.id : next.seen[0]!.id);
}
