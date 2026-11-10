import { z } from 'zod';

import { gameCredentialFields } from './admission';

/* Seat references only: Convex resolves public labels and linked accounts; chat stays in the Worker. */
const playNudgeSchema = z.strictObject({
  directorySequence: z.number().int().positive(),
  fromSeat: z.string().min(1).max(160),
  toSeat: z.string().min(1).max(160),
});
export const playPublishNudgeRequestSchema = playNudgeSchema.extend(gameCredentialFields);
export const playPublishNudgeResultSchema = z.object({ ok: z.boolean() });
export type PlayNudge = z.infer<typeof playNudgeSchema>;
export type PlayPublishNudgeRequest = z.infer<typeof playPublishNudgeRequestSchema>;
