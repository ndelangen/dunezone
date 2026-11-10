import { z } from 'zod';

import { gameCredentialFields } from './admission';

export const PLAY_NUDGE_COOLDOWN_MS = 5 * 60_000;
export const PLAY_NUDGE_MAX_AGE_MS = 2 * 60_000;
export const PLAY_NUDGE_MAX_ATTEMPTS = 4;
export const PLAY_NUDGE_RETRY_MS = 1000;
export const PLAY_NUDGE_RETRY_CEILING_MS = 10_000;

const identifier = z.string().min(1).max(160);
/* Only the public faction label and delivery identifiers leave the game; chat text stays there. */
export const playNudgeSchema = z.strictObject({
  nudgeId: identifier,
  fromFactionId: identifier,
  fromFactionName: z.string().min(1).max(160),
  toSeat: identifier,
  toUserId: identifier,
  at: z.number().finite().nonnegative(),
});
export const playPublishNudgeRequestSchema = playNudgeSchema.extend(gameCredentialFields);
export const playPublishNudgeResultSchema = z.object({ ok: z.boolean() });
export type PlayNudge = z.infer<typeof playNudgeSchema>;
export type PlayPublishNudgeRequest = z.infer<typeof playPublishNudgeRequestSchema>;
export type PlayPublishNudgeResult = z.infer<typeof playPublishNudgeResultSchema>;
