import { z } from 'zod';

import type { TablePiece } from './model';
import { tableIdSchema as id, tablePieceSchema } from './schema';

/*
 * Peeking: a faction looks at the hidden face of a card or token on the table, or through a whole deck, without turning it over.
 * Only the peeking faction is shown the faces; everyone else learns who peeked, from the piece.
 * While a deck is open to its peeker, they may put its cards in another order or pull one out beside it.
 */

/* A deck past this many cards is still peeked whole; the order an arrangement names is bounded so a frame stays small. */
/**
 * The most cards a deck held open can be rearranged or pulled from;
 * a bigger deck can only be looked through.
 * It keeps an arrangement well inside the Worker's message size, and the controls offer nothing above it, so no player sends a message the room would refuse at the door.
 */
export const PEEK_DECK_LIMIT = 200;
const deckIndex = z
  .number()
  .int()
  .min(0)
  .max(PEEK_DECK_LIMIT - 1);

/** Whether a deck held open is small enough to rearrange and pull from. */
export function rearrangeable(piece: { items: readonly unknown[] }): boolean {
  return piece.items.length <= PEEK_DECK_LIMIT;
}

export const peekActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('peek'), pieceId: id }),
  z.strictObject({ kind: z.literal('peek-close') }),
  /* The deck's cards in their new order, as indices into its current order, bottom card first. */
  z.strictObject({
    kind: z.literal('peek-arrange'),
    pieceId: id,
    order: z.array(deckIndex).min(2).max(PEEK_DECK_LIMIT),
  }),
  /* The card at this index of the deck's current order, bottom card first, comes out face down beside the deck. */
  z.strictObject({ kind: z.literal('peek-pull'), pieceId: id, index: deckIndex }),
]);
export type PeekAction = z.infer<typeof peekActionSchema>;

const PEEK_KINDS = new Set<string>(peekActionSchema.options.map((option) => option.shape.kind.value));

export function isPeekAction<Action extends { kind: string }>(action: Action): action is Action & PeekAction {
  return PEEK_KINDS.has(action.kind);
}

/** What the peeking faction is shown: the piece it holds open, every face showing. Only that faction's view carries it. */
export const peekSchema = z.object({ piece: tablePieceSchema });
export type Peek = z.infer<typeof peekSchema>;

/** Whether a peek looks through the whole piece: a card stack is a deck, while a token stack shows only its top. */
export function peeksWholeDeck(piece: { kind: TablePiece['kind']; items: readonly unknown[] }): boolean {
  return piece.kind === 'card' && piece.items.length > 1;
}

/** The items a peek shows, bottom first: every card of a deck, or the top card or token alone. */
function peekedItems<Item>(piece: { kind: TablePiece['kind']; items: readonly Item[] }): Item[] {
  return peeksWholeDeck(piece) ? [...piece.items] : piece.items.slice(-1);
}

/** Whether everything a peek shows names its peeker in public: a faction sees faces only where everyone sees that it peeked. */
export function showsPeeker(
  piece: { kind: TablePiece['kind']; items: readonly Readonly<{ peekedBy?: readonly string[] }>[] },
  factionId: string
): boolean {
  return peekedItems(piece).every((item) => item.peekedBy?.includes(factionId));
}

/** Whether a piece has a hidden face to peek at: a face-down card anywhere in it, or a face-down token on top. */
export function hasHiddenFace(piece: Pick<TablePiece, 'kind' | 'items'>): boolean {
  return peekedItems(piece).some((item) => !item.faceUp);
}

/** The factions that peeked at any card or token of a piece, in the order they first did. */
export function peekersOf(piece: Pick<TablePiece, 'items'>): string[] {
  return [...new Set(piece.items.flatMap((item) => item.peekedBy ?? []))];
}
