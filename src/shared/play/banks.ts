import { z } from 'zod';

import { tableCountSchema, tableIdSchema } from './schema';

/** The wire carries one faction's bank, only to its current player. */
export const factionBankSchema = z.object({
  factionId: tableIdSchema,
  balance: tableCountSchema,
});
export type FactionBank = z.infer<typeof factionBankSchema>;

export const spiceTransferSchema = z.object({
  revision: tableCountSchema,
  kind: z.enum(['withdrawal', 'collection', 'supply', 'disposal']),
  actor: z.string(),
  amount: tableCountSchema.positive(),
  source: z.string(),
  destination: z.string().optional(),
});
export type SpiceTransfer = z.infer<typeof spiceTransferSchema>;

export const bankActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('bank-withdraw'), amount: tableCountSchema.positive() }),
  z.strictObject({ kind: z.literal('bank-collect'), pieceId: tableIdSchema }),
]);
export type BankAction = z.infer<typeof bankActionSchema>;
