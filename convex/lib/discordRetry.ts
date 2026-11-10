import { v } from 'convex/values';

import type { Doc } from '../_generated/dataModel';

export const discordRetryOperation = v.union(
  v.literal('categories'),
  v.literal('create'),
  v.literal('invite'),
  v.literal('rename-ended'),
  v.literal('rename-active'),
  v.literal('delete')
);

/** Every claimant recovers the same bounded retry budget, including after a worker crash. */
export const discordShortRetry = v.object({
  operation: discordRetryOperation,
  attempts: v.union(v.literal(1), v.literal(2)),
  categoryId: v.optional(v.string()),
  revision: v.number(),
});

/** Only the same definitely rejected creation may reuse its existing creation reservation. */
export function retryCreationCategory(channel: Doc<'play_game_discord_channels'>) {
  const retry = channel.short_retry;
  return retry?.operation === 'create' &&
    retry.revision === (channel.work_revision ?? 0) &&
    channel.state === 'pending' &&
    !channel.channel_id
    ? retry.categoryId
    : undefined;
}
