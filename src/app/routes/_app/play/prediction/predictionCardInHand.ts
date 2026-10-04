import type { TableProjection } from '../multiplayer/TableSession';

/**
 * Whether the viewer holds the card dealt for a locked prediction (#1753).
 * Placing that card on the table reveals the prediction, so while it is in hand the card is the reveal control.
 */
export function predictionCardInHand(table: TableProjection, stepId: string): boolean {
  return (table.snapshot.hand ?? []).some((piece) =>
    piece.items.some((item) => item.artwork?.prediction?.stepId === stepId)
  );
}
