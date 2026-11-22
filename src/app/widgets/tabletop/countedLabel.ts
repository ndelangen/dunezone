import type { TablePiece } from '@shared/play/model';

/**
 * A stack's name with its count, as its tooltip reads it (#2988): the name first, then the count, "Harkonnen Troop ×10".
 * Piece names come from whoever made them, singular or plural, so the count never asks the name for a plural (Norbert, 2026-11-22).
 * A deck counts its cards, "Spice deck, 25 cards", since the count is not of decks;
 * a pile already named for its cards reads "Treachery card ×2".
 */
export function countedLabel(piece: Pick<TablePiece, 'kind' | 'label'>, count: number): string {
  const label = piece.label.trim();
  if (piece.kind === 'card' && !/\bcards?$/i.test(label)) {
    return label ? `${label}, ${count} cards` : `${count} cards`;
  }
  return label ? `${label} ×${count}` : `×${count}`;
}
