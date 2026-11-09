/*
 * The one entry the table makes in the Treachery tracker by itself (#2794): Atreides peeking at the card up for bid puts that card up for bid.
 * Everything else, who won it, where cards went and what a hand holds, is the player's own work and judgement.
 * A peek is followed once per table card, so reading the same table again, or after a reload, changes nothing,
 * and a card dismissed as never up for bid stays dismissed.
 */
import { onBid, reservedCards, trackerReducer, unplaced } from '@app/widgets/treachery-tracker/tracker';
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

/** The table cards the tracker already put up for bid, by item id. */
export type TableMemory = Readonly<{ peeked: readonly string[] }>;

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
  const card = peek && !peeked.includes(peek.item) ? freeCopy(state, peek.face) : undefined;
  if (!peek || !card) {
    return { state, memory };
  }
  /* The unknown card already on bid, put up by hand before the peek, is the card peeked at: it is named, not bid again. */
  const unknown = onBid(state);
  return {
    state: trackerReducer(
      state,
      unknown?.card === null ? { kind: 'name', sighting: unknown.id, card } : { kind: 'bid', card, turn }
    ),
    memory: { peeked: [...peeked, peek.item].slice(-MEMORY_LIMIT) },
  };
}
