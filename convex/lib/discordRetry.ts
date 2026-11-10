import { v } from 'convex/values';

import { internal } from '../_generated/api';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

export const DISCORD_PARKED = Number.MAX_SAFE_INTEGER;
export const DISCORD_ATTEMPTS = 3;

export const discordLifecycleOperation = v.union(
  v.literal('provision'),
  v.literal('rename-ended'),
  v.literal('rename-active'),
  v.literal('delete')
);

export const discordRetryOperation = v.union(
  v.literal('categories'),
  v.literal('recover'),
  v.literal('create'),
  v.literal('invite'),
  v.literal('rename-ended'),
  v.literal('rename-active'),
  v.literal('delete')
);

export const discordRetryState = v.object({
  kind: v.literal('bounded'),
  operation: discordLifecycleOperation,
  revision: v.number(),
  attempts: v.union(v.literal(1), v.literal(2), v.literal(3)),
  needsAttention: v.boolean(),
  until: v.optional(v.number()),
});

export function discordNeedsAttention(channel: Doc<'play_game_discord_channels'>) {
  return (
    channel.retry?.kind === 'bounded' &&
    channel.retry.revision === (channel.work_revision ?? 0) &&
    channel.retry.needsAttention
  );
}

/** Explicit retry fences the prior release without authorizing a replacement for uncertain creation. */
export async function retryDiscordChannel(ctx: MutationCtx, channel: Doc<'play_game_discord_channels'>): Promise<void> {
  const cooldown = await ctx.db.query('play_discord_cooldown').unique();
  const sameWork = channel.retry?.revision === (channel.work_revision ?? 0);
  const retryUntil = sameWork && (channel.retry?.until ?? 0) < DISCORD_PARKED ? (channel.retry?.until ?? 0) : 0;
  const heldUntil = Math.max(channel.retry_after ?? 0, cooldown?.blocked_until ?? 0, retryUntil);
  const at = Math.max(Date.now(), channel.lease_until ?? 0, heldUntil);
  await ctx.db.patch(channel._id, {
    work_revision: (channel.work_revision ?? 0) + 1,
    retry: undefined,
    retry_after: heldUntil > Date.now() ? heldUntil : undefined,
    error: undefined,
    next_attempt_at: at,
  });
  await ctx.scheduler.runAt(at, internal.playDiscordActions.reconcile, { channelId: channel._id });
}

/** Only the same definitely rejected creation may reuse its existing creation reservation. */
export function retryCreationCategory(channel: Doc<'play_game_discord_channels'>) {
  const retry = channel.retry;
  const knownRejection = retry?.operation === 'provision' && (channel.creation_attempt ?? 0) > 0;
  if (
    !knownRejection ||
    !retry ||
    retry.revision !== (channel.work_revision ?? 0) ||
    channel.state !== 'pending' ||
    channel.channel_id
  ) {
    return undefined;
  }
  return channel.creation_category_id;
}
