import { z } from 'zod';

import { tableIdentitySchema, tableIdSchema } from './schema';
import { TABLE_SEAT_COUNTS } from './tableSettings';

/*
 * Explicit participation: how a spectator becomes a player and how a player stops being one.
 * Watching never claims a place. A spectator asks for a place in the drafting roster, or for one
 * named vacant seat once the seating is fixed, and one current player approves. A player leaves
 * only by their own departure, a removal vote or account deletion; disconnecting changes nothing.
 * The last player leaving discards the game for good.
 */

/** The most players a drafting roster admits; a fixed seat count never exceeds it. */
export const PLAY_ROSTER_LIMIT = TABLE_SEAT_COUNTS[TABLE_SEAT_COUNTS.length - 1]!;

/** One pending request as every viewer sees it. The requester is named, never identified. */
export const seatRequestSchema = z.object({
  id: tableIdSchema,
  requesterName: z.string(),
  /* The vacant seat asked for, or null for a place in the drafting roster. */
  seat: tableIdentitySchema.nullable(),
  /* Present on the requester's own view only, so the panel can offer them Withdraw. */
  own: z.boolean().optional(),
});
export type SeatRequest = z.infer<typeof seatRequestSchema>;

export const seatActionSchema = z.discriminatedUnion('kind', [
  /* A spectator asks for a place; the seat is required once the seating is fixed and ignored while drafting. */
  z.strictObject({ kind: z.literal('seat-request'), seat: tableIdentitySchema.optional() }),
  z.strictObject({ kind: z.literal('seat-withdraw') }),
  z.strictObject({ kind: z.literal('seat-approve'), requestId: tableIdSchema }),
  z.strictObject({ kind: z.literal('seat-depart') }),
]);
export type SeatAction = z.infer<typeof seatActionSchema>;

const SEAT_ACTION_KINDS: ReadonlySet<string> = new Set(
  seatActionSchema.options.map((option) => option.shape.kind.value)
);

export function isSeatAction(action: { kind: string }): action is SeatAction {
  return SEAT_ACTION_KINDS.has(action.kind);
}

/** A real game numbers its seats; the log and the panel say "seat 3" for `seat-3` and fall back to the id. */
export function seatLabel(seatId: string): string {
  const number = /^seat-(\d+)$/.exec(seatId)?.[1];
  return number ? `seat ${Number(number)}` : seatId;
}
