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
export const playPublishNudgeResultSchema = z.object({ ok: z.boolean() });
export type PlayNudge = z.infer<typeof playNudgeSchema>;
export type PlaySendNudgeRequest = z.infer<typeof playSendNudgeRequestSchema>;

/* The previous Worker calls this mutation until its rollout completes; those requests are acknowledged and dropped. */
export const playPublishNudgeRequestSchema = z.strictObject({
  ...gameCredentialFields,
  nudgeId: identifier,
  fromFactionId: identifier,
  fromFactionName: z.string().min(1).max(160),
  toSeat: identifier,
  toUserId: identifier,
  at: z.number().finite().nonnegative(),
});
