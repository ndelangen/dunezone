import { v } from 'convex/values';

import type { Doc } from '../_generated/dataModel';

export const discordRetryOperation = v.union(
  v.literal('categories'),
  v.literal('recover'),
  v.literal('create'),
  v.literal('invite'),
  v.literal('rename-ended'),
  v.literal('rename-active'),
  v.literal('delete')
);

/** Keep the retry budget and application backoff independent of cron's pickup deadline. */
export const discordRetryState = v.union(
  v.object({
    kind: v.literal('short'),
    operation: discordRetryOperation,
    attempts: v.union(v.literal(1), v.literal(2)),
    categoryId: v.optional(v.string()),
    revision: v.number(),
    until: v.optional(v.number()),
  }),
  v.object({ kind: v.literal('backoff'), revision: v.number(), until: v.number() })
);

/** Only the same definitely rejected creation may reuse its existing creation reservation. */
export function retryCreationCategory(channel: Doc<'play_game_discord_channels'>) {
  const retry = channel.retry;
  return retry?.kind === 'short' &&
    retry.operation === 'create' &&
    retry.revision === (channel.work_revision ?? 0) &&
    channel.state === 'pending' &&
    !channel.channel_id
    ? retry.categoryId
    : undefined;
}
