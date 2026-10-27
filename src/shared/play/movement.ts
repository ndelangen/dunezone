import { z } from 'zod';

import { tableIdSchema } from './schema';

/**
 * Shipment and Movement, one faction at a time: each faction says when it has finished shipping and moving.
 * The table saves a checkpoint each time, so a review can look at the board after any faction's turn.
 * Factions finish in any order, since some may act out of storm order.
 * The table only suggests whose turn it is next.
 */
export const movementTurnsSchema = z.object({ done: z.array(tableIdSchema) });
export type MovementTurns = z.infer<typeof movementTurnsSchema>;

export const movementActionSchema = z.strictObject({ kind: z.literal('movement-done') });
export type MovementAction = z.infer<typeof movementActionSchema>;

export const MOVEMENT_PHASE_ID = 'shipment-and-movement';

/** The first faction in storm order that has not finished this Shipment and Movement, if any is left. */
export function nextToMove(order: readonly string[], movement: MovementTurns | undefined): string | undefined {
  return order.find((factionId) => !movement?.done.includes(factionId));
}
