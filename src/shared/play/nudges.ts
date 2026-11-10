import { z } from 'zod';

import { gameCredentialFields } from './admission';

const identifier = z.string().min(1).max(160);
/* Expected seat identities let Convex reject stale occupants without waiting for activity updates. */
const playNudgeSchema = z.strictObject({
  fromSeat: identifier,
  fromUserId: identifier,
  fromFactionId: identifier,
  toSeat: identifier,
  toUserId: identifier,
});
export const playSendNudgeRequestSchema = playNudgeSchema.extend(gameCredentialFields);
export const playSendNudgeResultSchema = z.object({ ok: z.boolean() });
export type PlayNudge = z.infer<typeof playNudgeSchema>;
export type PlaySendNudgeRequest = z.infer<typeof playSendNudgeRequestSchema>;
