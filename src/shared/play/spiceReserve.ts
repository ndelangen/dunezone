import { z } from 'zod';

import { tableCountSchema, tableIdSchema, tablePositionSchema } from './schema';

/** The wire carries one faction's spice reserve, only to its current player. */
export const spiceReserveSchema = z.object({
  factionId: tableIdSchema,
  balance: tableCountSchema,
});

/*
 * Spice set down on another faction's token is either a payment, straight into that faction's spice reserve,
 * or a bribe, kept in a public pile by that faction until its player collects it.
 */
export const SPICE_GIFTS = ['bribe', 'payment'] as const;
export type SpiceGift = (typeof SPICE_GIFTS)[number];
/* What the placer chose for spice let go over a token, and the faction it was offered to, so a token moved in between refuses it. */
export const spiceGiftSchema = z.strictObject({ as: z.enum(SPICE_GIFTS), factionId: tableIdSchema });
export type SpiceGiftChoice = z.infer<typeof spiceGiftSchema>;

export const spiceTransferSchema = z.object({
  revision: tableCountSchema,
  /*
   * The glossary term for the shared pile is "Spice Bank" (see CONTEXT.md).
   * The `supply` kind, and `supply` as a source, are kept because transfer records are stored data.
   */
  kind: z.enum(['withdrawal', 'collection', 'supply', 'disposal', ...SPICE_GIFTS]),
  actor: z.string(),
  amount: tableCountSchema.positive(),
  source: z.string(),
  destination: z.string().optional(),
});
export type SpiceTransfer = z.infer<typeof spiceTransferSchema>;

/*
 * The glossary term is "spice reserve" (see CONTEXT.md).
 * The `bank-` command kinds are kept because they are protocol messages and recorded command receipts.
 */
export const spiceReserveActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('bank-withdraw'),
    amount: tableCountSchema.positive(),
    position: tablePositionSchema.optional(),
  }),
  z.strictObject({ kind: z.literal('bank-collect'), pieceId: tableIdSchema }),
]);
export type SpiceReserveAction = z.infer<typeof spiceReserveActionSchema>;
