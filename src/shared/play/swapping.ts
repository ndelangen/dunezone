import { z } from 'zod';

import { tableCountSchema, tableIdSchema, tableSeatSchema } from './schema';

export const SWAPPING_DURATION_MS = 4 * 60 * 1000;

export const swapOfferSchema = z.object({
  id: tableIdSchema,
  origin: tableSeatSchema,
  target: tableSeatSchema,
  order: tableCountSchema,
});
export const swappingStateSchema = z.object({
  round: tableIdSchema,
  deadline: tableCountSchema,
  closed: z.boolean(),
  ready: z.array(tableSeatSchema),
  offers: z.array(swapOfferSchema),
  nextOrder: tableCountSchema,
  tokens: z.record(tableIdSchema, z.string()).default({}),
});
export type SwappingState = z.infer<typeof swappingStateSchema>;
export type SwapOffer = z.infer<typeof swapOfferSchema>;

const expected = { round: tableIdSchema, seat: tableSeatSchema };
export const swapActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('swap-offer'), ...expected, target: tableSeatSchema }),
  z.strictObject({ kind: z.literal('swap-cancel'), ...expected, offerId: tableIdSchema }),
  z.strictObject({ kind: z.literal('swap-accept'), ...expected, offerId: tableIdSchema }),
  z.strictObject({ kind: z.literal('swap-ready'), ...expected, ready: z.boolean() }),
]);
export type SwapAction = z.infer<typeof swapActionSchema>;
const kinds: ReadonlySet<string> = new Set(swapActionSchema.options.map((option) => option.shape.kind.value));
export function isSwapAction(action: { kind: string }): action is SwapAction {
  return kinds.has(action.kind);
}

export function openSwapping(round: string, now: number): SwappingState {
  return {
    round,
    deadline: now + SWAPPING_DURATION_MS,
    closed: false,
    ready: [],
    offers: [],
    nextOrder: 1,
    tokens: {},
  };
}
