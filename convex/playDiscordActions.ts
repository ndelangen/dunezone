import type { FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { DiscordFailure, DiscordPaused, DiscordRest, discordConfiguration } from './lib/discordRest';

type Claim = { channelId: Id<'play_game_discord_channels'>; lease: string };
type Work = NonNullable<FunctionReturnType<typeof internal.playDiscord.work>>;
type Progress = 'continue' | 'complete';

async function createRoom(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>,
  name: string
): Promise<Progress> {
  const categories = await rest.categories(row.guild_id, row.category_ids);
  for (const categoryId of categories) {
    if (!(await ctx.runMutation(internal.playDiscord.startCreation, claim))) {
      return 'complete';
    }
    let channelId: string;
    try {
      channelId = await rest.create(row.guild_id, categoryId, name);
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
        continue;
      }
      throw error;
    }
    if (!(await ctx.runMutation(internal.playDiscord.created, { ...claim, discordChannelId: channelId }))) {
      await rest.remove(channelId);
    }
    return 'continue';
  }
  throw new Error('No configured Discord category has room for another voice channel.');
}

/** Commit retirement before DELETE, so later activity cannot reverse a request already sent to Discord. */
async function removeRoom(ctx: ActionCtx, rest: DiscordRest, claim: Claim, channel: Work['channel']) {
  if (!(await ctx.runMutation(internal.playDiscord.beginDeletion, claim))) {
    return;
  }
  if (channel.channel_id) {
    await rest.remove(channel.channel_id);
  }
  await ctx.runMutation(internal.playDiscord.removed, claim);
}

/** Only Unknown Channel is terminal; every other rename failure stays available for retry. */
async function renameRoom(ctx: ActionCtx, rest: DiscordRest, claim: Claim, work: Work): Promise<Progress> {
  try {
    await rest.rename(work.channel.channel_id!, work.name);
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
async function reconcileStep(ctx: ActionCtx, rest: DiscordRest, claim: Claim): Promise<Progress> {
  const work = await ctx.runMutation(internal.playDiscord.work, claim);
  if (!work) {
    return 'complete';
  }
  if (work.channel.state === 'creating') {
    throw new Error('Channel creation has no confirmed result. Check Discord before retrying it.');
  }
  if (work.remove) {
    await removeRoom(ctx, rest, claim, work.channel);
    return 'complete';
  }
  if (work.channel.state === 'pending') {
    if (work.channel.channel_id) {
      const url = await rest.invite(work.channel.channel_id);
      await ctx.runMutation(internal.playDiscord.invited, { ...claim, url });
    } else {
      return await createRoom(ctx, rest, claim, work.channel, work.name);
    }
    return 'continue';
  }
  if (work.channel.channel_id && !!work.channel.renamed_ended !== work.ended) {
    return await renameRoom(ctx, rest, claim, work);
  }
  return 'complete';
}

/** One owner provisions or removes the game room; a saved channel survives invitation retries. */
export const reconcile = internalAction({
  args: { channelId: v.id('play_game_discord_channels') },
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
    let failure: { error: string; retryAfterMs?: number } | undefined;
    try {
      for (let step = 0; step < 5; step += 1) {
        if ((await reconcileStep(ctx, rest, claim)) === 'complete') {
          break;
        }
      }
    } catch (error) {
      failure = {
        error: error instanceof DiscordFailure ? error.message : 'Discord voice work could not finish.',
        ...(error instanceof DiscordFailure ? { retryAfterMs: error.retryAfterMs } : {}),
      };
    } finally {
      await ctx.runMutation(internal.playDiscord.release, { ...claim, ...failure });
    }
    return null;
  },
});
