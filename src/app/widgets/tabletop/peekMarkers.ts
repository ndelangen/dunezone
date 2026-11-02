import { factionTokenOf } from '@shared/play/factionToken';
import type { TablePiece, Vector3Tuple } from '@shared/play/model';
import { hasHiddenFace, peekersOf } from '@shared/play/peeking';
import { CARD_LAYER_STAGGER } from '@shared/play/pieceFlip';
import {
  CARD_DEPTH,
  CARD_WIDTH,
  FACTION_TOKEN_SCALE,
  stackTopHeight,
  TROOP_LAYER_HEIGHT,
  TROOP_TOP_RADIUS,
  visibleLayerCount,
} from '@shared/play/tableGeometry';

/*
 * A faction that peeked at a card or deck leaves a small copy of its token in the card's bottom right corner,
 * where everyone sees it until the card is drawn or the deck shuffled. Several peekers' tokens overlap in a row towards the left.
 */

/** How wide a peek marker is: about a third of a card, so a row of several still fits along its bottom edge. */
export const PEEK_MARKER_RADIUS = 0.13;
/** A peek marker is a faction token drawn this much smaller than the token at the faction's seat. */
export const PEEK_MARKER_SCALE = PEEK_MARKER_RADIUS / (TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE);
const EDGE_INSET = 0.03;
/* Each marker overlaps the one before it by about a third, and steps up by its thickness so it lies on top. */
const OVERLAPPING_STEP = PEEK_MARKER_RADIUS * 1.4;
const MARKER_THICKNESS = TROOP_LAYER_HEIGHT * PEEK_MARKER_SCALE;

/** The tokens to lay on a card or deck: one per faction that peeked at it, as the faction's own token lies, face up; none on a token stack or a card with nothing hidden. */
export function peekMarkerTokens(piece: TablePiece, pieces: readonly TablePiece[]): TablePiece[] {
  if (piece.kind !== 'card' || !hasHiddenFace(piece)) {
    return [];
  }
  return peekersOf(piece).flatMap((factionId) => {
    const token = factionTokenOf(pieces, factionId);
    const item = token?.items[0];
    return token && item ? [{ ...token, items: [{ ...item, faceUp: true }], flipRevision: undefined }] : [];
  });
}

/** Where each of `count` markers lies on the card stack, in the stack's own frame: the first in the bottom right corner of its top card, the rest overlapping towards the left. */
export function peekMarkerSlots(piece: TablePiece, count: number): Vector3Tuple[] {
  const right = CARD_WIDTH / 2 - EDGE_INSET - PEEK_MARKER_RADIUS;
  const bottom = CARD_DEPTH / 2 - EDGE_INSET - PEEK_MARKER_RADIUS;
  /* The top card of a stack sits furthest along its stagger. */
  const topOffset = ((visibleLayerCount(piece) - 1) / 2) * CARD_LAYER_STAGGER;
  const room = 2 * right;
  const step = count > 1 ? Math.min(OVERLAPPING_STEP, room / (count - 1)) : 0;
  const top = stackTopHeight(piece);
  return Array.from({ length: count }, (_, index) => [
    topOffset + right - index * step,
    top + index * MARKER_THICKNESS,
    bottom,
  ]);
}
