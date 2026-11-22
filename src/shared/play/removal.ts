import { z } from 'zod';

import { actionKindGuard } from './actionKinds';
import { tableCountSchema, tableIdSchema, tableIdentitySchema } from './schema';

const removalChoiceSchema = z.enum(['remove', 'keep']).nullable();
export const removalVoteSchema = z.object({
  id: tableIdSchema,
  target: z.object({ name: z.string(), seat: tableIdentitySchema }),
  openedAt: tableCountSchema,
  threshold: tableCountSchema,
  ballots: z.array(z.object({ name: z.string(), seat: tableIdentitySchema, choice: removalChoiceSchema })),
});
export type RemovalVote = z.infer<typeof removalVoteSchema>;

export const removalActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('removal-start'), seat: tableIdentitySchema }),
  z.strictObject({ kind: z.literal('removal-ballot'), voteId: tableIdSchema, choice: removalChoiceSchema }),
]);
export type RemovalAction = z.infer<typeof removalActionSchema>;
export const isRemovalAction = actionKindGuard(removalActionSchema);

/** Current players other than the target vote; fewer than three players cannot remove anyone. */
export function removalThreshold(players: number): number {
  return Math.ceil((players - 1) / 2) + 1;
}
