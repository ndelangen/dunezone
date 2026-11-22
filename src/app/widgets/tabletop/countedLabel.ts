import type { TablePiece } from '@shared/play/model';

/**
 * A stack's name with its count, as its tooltip reads it (#2988): the name first, then the count, "Harkonnen Troop ×10".
 * Catalogue pieces are named in the singular by whoever made them, so the count never asks the name for a plural (Norbert, 2026-11-22).
 * A deck counts its cards, "Spice deck, 25 cards", since the count is not of decks.
 */
export function countedLabel(piece: Pick<TablePiece, 'kind' | 'label'>, count: number): string {
  const label = piece.label.trim();
  if (piece.kind === 'card') {
    return label ? `${label}, ${count} cards` : `${count} cards`;
  }
  return label ? `${label} ×${count}` : `×${count}`;
}
