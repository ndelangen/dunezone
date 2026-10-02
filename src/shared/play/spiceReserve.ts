import { z } from 'zod';

import { tableCountSchema, tableIdSchema } from './schema';

/** The wire carries one faction's spice reserve, only to its current player. */
export const spiceReserveSchema = z.object({
  factionId: tableIdSchema,
  balance: tableCountSchema,
});

export const spiceTransferSchema = z.object({
  revision: tableCountSchema,
  /*
   * The glossary term for the shared pile is "Spice Bank" (see CONTEXT.md).
   * The `supply` kind, and `supply` as a source, are kept because transfer records are stored data.
   */
  kind: z.enum(['withdrawal', 'collection', 'supply', 'disposal']),
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
  z.strictObject({ kind: z.literal('bank-withdraw'), amount: tableCountSchema.positive() }),
  z.strictObject({ kind: z.literal('bank-collect'), pieceId: tableIdSchema }),
]);
export type SpiceReserveAction = z.infer<typeof spiceReserveActionSchema>;
