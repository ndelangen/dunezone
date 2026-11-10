import type { FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { DiscordFailure, DiscordPaused, DiscordRest, discordConfiguration } from './lib/discordRest';
import { discordRetry, retryCreationCategory } from './lib/playDiscord';
import type { discordRetryOperation } from './lib/playDiscord';

type Claim = { channelId: Id<'play_game_discord_channels'>; lease: string; retry?: Infer<typeof discordRetry> };
type Work = NonNullable<FunctionReturnType<typeof internal.playDiscord.work>>;
type Progress = 'continue' | 'complete';
type Perform = <T>(
  operation: Infer<typeof discordRetryOperation>,
  request: () => Promise<T>,
  categoryId?: string
) => Promise<T>;

async function createRoom(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>,
  name: string,
  perform: Perform
): Promise<Progress> {
  const retryCategory = retryCreationCategory(row, claim.retry);
  const categories = retryCategory
    ? [retryCategory]
    : await perform('categories', () => rest.categories(row.guild_id, row.category_ids));
  for (const categoryId of categories) {
    if (!(await ctx.runMutation(internal.playDiscord.startCreation, { ...claim, categoryId }))) {
      return 'complete';
    }
    let channelId: string;
    try {
      channelId = await perform('create', () => rest.create(row.guild_id, categoryId, name), categoryId);
    } catch (error) {
      if (
        !(error instanceof DiscordPaused) &&
        !(error instanceof DiscordFailure && error.status >= 400 && error.status < 500)
      ) {
        throw error;
      }
      await ctx.runMutation(internal.playDiscord.rejectedCreation, claim);
      /* A category may have filled since listing it; Discord rejected the create, so trying the next category is safe. */
      if (error instanceof DiscordFailure && error.status === 400 && error.code === 50_035) {
        if (retryCategory === categoryId) {
          categories.push(
            ...(await perform('categories', () => rest.categories(row.guild_id, row.category_ids))).filter(
              (id) => id !== categoryId
            )
          );
        }
        continue;
      }
      throw error;
    }
    if (!(await ctx.runMutation(internal.playDiscord.created, { ...claim, discordChannelId: channelId }))) {
      await perform('delete', () => rest.remove(channelId));
    }
    return 'continue';
  }
  throw new Error('No configured Discord category has room for another voice channel.');
}

/** Commit retirement before DELETE, so later activity cannot reverse a request already sent to Discord. */
async function removeRoom(ctx: ActionCtx, rest: DiscordRest, claim: Claim, channel: Work['channel'], perform: Perform) {
  if (!(await ctx.runMutation(internal.playDiscord.beginDeletion, claim))) {
    return;
  }
  if (channel.channel_id) {
    await perform('delete', () => rest.remove(channel.channel_id!));
  }
  await ctx.runMutation(internal.playDiscord.removed, claim);
}

/** Only Unknown Channel is terminal; every other rename failure stays available for retry. */
async function renameRoom(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  work: Work,
  perform: Perform
): Promise<Progress> {
  try {
    await perform(work.ended ? 'rename-ended' : 'rename-active', () =>
      rest.rename(work.channel.channel_id!, work.name)
    );
  } catch (error) {
    if (!(error instanceof DiscordFailure && error.status === 404 && error.code === 10_003)) {
      throw error;
    }
    await ctx.runMutation(internal.playDiscord.removed, claim);
    return 'complete';
  }
  await ctx.runMutation(internal.playDiscord.renamed, { ...claim, ended: work.ended });
  return 'continue';
}

/** Each transition reads current work again because discard and continue may arrive during any Discord response. */
async function reconcileStep(ctx: ActionCtx, rest: DiscordRest, claim: Claim, perform: Perform): Promise<Progress> {
  const work = await ctx.runMutation(internal.playDiscord.work, claim);
  if (!work) {
    return 'complete';
  }
  if (work.channel.state === 'creating') {
    throw new Error('Channel creation has no confirmed result. Check Discord before retrying it.');
  }
  if (work.remove) {
    await removeRoom(ctx, rest, claim, work.channel, perform);
    return 'complete';
  }
  if (work.channel.state === 'pending') {
    if (work.channel.channel_id) {
      const url = await perform('invite', () => rest.invite(work.channel.channel_id!));
      await ctx.runMutation(internal.playDiscord.invited, { ...claim, url });
    } else {
      return await createRoom(ctx, rest, claim, work.channel, work.name, perform);
    }
    return 'continue';
  }
  if (work.channel.channel_id && !!work.channel.renamed_ended !== work.ended) {
    return await renameRoom(ctx, rest, claim, work, perform);
  }
  return 'complete';
}

/** One owner provisions or removes the game room; a saved channel survives invitation retries. */
export const reconcile = internalAction({
  args: { channelId: v.id('play_game_discord_channels'), retry: v.optional(discordRetry) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = discordConfiguration();
    if (!config) {
      return null;
    }
    const row = await ctx.runMutation(internal.playDiscord.claim, args);
    if (!row?.lease) {
      return null;
    }
    const claim = { ...args, lease: row.lease };
    const rest = new DiscordRest(config.token, `Dune Play game ${row.game_id}`, {
      until: () => ctx.runQuery(internal.playDiscord.cooldownUntil, {}),
      hold: (until) => ctx.runMutation(internal.playDiscord.holdRequests, { until }),
    });
    let retryOperation: Infer<typeof discordRetryOperation> | undefined;
    let retryCategoryId: string | undefined;
    const perform: Perform = async (operation, request, categoryId) => {
      retryOperation = operation;
      retryCategoryId = categoryId;
      return await request();
    };
    let failure:
      | {
          error: string;
          retryAfterMs?: number;
          retryOperation?: Infer<typeof discordRetryOperation>;
          retryCategoryId?: string;
        }
      | undefined;
    try {
      for (let step = 0; step < 5; step += 1) {
        if ((await reconcileStep(ctx, rest, claim, perform)) === 'complete') {
          break;
        }
      }
    } catch (error) {
      failure = {
        error: error instanceof DiscordFailure ? error.message : 'Discord voice work could not finish.',
        ...(error instanceof DiscordFailure
          ? { retryAfterMs: error.retryAfterMs, retryOperation, retryCategoryId }
          : {}),
      };
    } finally {
      await ctx.runMutation(internal.playDiscord.release, { ...claim, ...failure });
    }
    return null;
  },
});
