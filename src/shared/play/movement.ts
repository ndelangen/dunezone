import { z } from 'zod';

import { tableIdSchema } from './schema';

/**
 * Shipment and Movement, one faction at a time, in a turn order the table can rearrange.
 * The order starts as storm order.
 * Players drag the factions still to go into another order when someone acts out of turn, and the table keeps that order.
 * Marking a faction done saves a checkpoint, so a review can look at the board after any faction's turn.
 * The active faction is the first in the order that is not done.
 */
export const movementTurnsSchema = z.object({
  done: z.array(tableIdSchema).max(30),
  order: z.array(tableIdSchema).max(30).optional(),
});
export type MovementTurns = z.infer<typeof movementTurnsSchema>;

export const movementActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('movement-done'), factionId: tableIdSchema }),
  z.strictObject({ kind: z.literal('movement-undo'), factionId: tableIdSchema }),
  z.strictObject({ kind: z.literal('movement-order'), order: z.array(tableIdSchema).max(30) }),
]);
export type MovementAction = z.infer<typeof movementActionSchema>;

export const MOVEMENT_PHASE_ID = 'shipment-and-movement';

/**
 * The turn order the table plays.
 * The factions done come first, in the order they finished, since their turns are played and their places locked.
 * The rest follow in the order players arranged, kept to the factions still at the table, then any faction it does not name yet, in storm order.
 */
export function movementOrder(stormOrder: readonly string[], movement: MovementTurns | undefined): string[] {
  const done = (movement?.done ?? []).filter((factionId) => stormOrder.includes(factionId));
  const arranged = (movement?.order ?? []).filter(
    (factionId) => stormOrder.includes(factionId) && !done.includes(factionId)
  );
  const placed = [...done, ...arranged];
  return [...placed, ...stormOrder.filter((factionId) => !placed.includes(factionId))];
}

/** The first faction in the turn order that has not finished this Shipment and Movement, if any is left. */
export function nextToMove(order: readonly string[], movement: MovementTurns | undefined): string | undefined {
  return order.find((factionId) => !movement?.done.includes(factionId));
}
