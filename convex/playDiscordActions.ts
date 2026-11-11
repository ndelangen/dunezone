import type { FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import { ZodError } from 'zod';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { discordCooldown } from './lib/discordCooldown';
import { DiscordFailure, DiscordPaused, DiscordRest, discordConfiguration } from './lib/discordRest';
import { retryCreationCategory } from './lib/discordRetry';

type Claim = { channelId: Id<'play_game_discord_channels'>; lease: string };
type Work = NonNullable<FunctionReturnType<typeof internal.playDiscord.work>>;
type Progress = 'continue' | 'complete';

class NoDiscordChannelRoom extends Error {
  constructor() {
    super('No configured Discord category has room for another voice channel.');
  }
}

class DiscordRecoveryUnavailable extends Error {}

async function postCreation(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>,
  categoryId: string
) {
  let channelId: string;
  try {
    channelId = await rest.create(row.guild_id, categoryId, `dune-play-${row.game_id}`);
  } catch (error) {
    if (
      error instanceof DiscordPaused ||
      (error instanceof DiscordFailure && error.status >= 400 && error.status < 500)
    ) {
      await ctx.runMutation(internal.playDiscord.rejectedCreation, claim);
    }
    throw error;
  }
  if (!(await ctx.runMutation(internal.playDiscord.created, { ...claim, discordChannelId: channelId }))) {
    await rest.remove(channelId);
  }
}

async function categoriesAfterRejection(
  error: unknown,
  rest: DiscordRest,
  row: Doc<'play_game_discord_channels'>,
  categoryId: string,
  retryCategory: string | undefined
) {
  /* A category may have filled since listing it; Discord rejected the create, so trying the next category is safe. */
  if (!(error instanceof DiscordFailure && error.status === 400 && error.code === 50_035)) {
    throw error;
  }
  if (retryCategory !== categoryId) {
    return [];
  }
  return (await rest.categories(row.guild_id, row.category_ids)).filter((id) => id !== categoryId);
}

async function createRoom(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>
): Promise<Progress> {
  const retryCategory = retryCreationCategory(row);
  const categories = retryCategory ? [retryCategory] : await rest.categories(row.guild_id, row.category_ids);
  for (const categoryId of categories) {
    if (!(await ctx.runMutation(internal.playDiscord.startCreation, { ...claim, categoryId }))) {
      return 'complete';
    }
    try {
      await postCreation(ctx, rest, claim, row, categoryId);
    } catch (error) {
      categories.push(...(await categoriesAfterRejection(error, rest, row, categoryId, retryCategory)));
      continue;
    }
    return 'continue';
  }
  throw new NoDiscordChannelRoom();
}

/** A listing proves only what is visible. Administrator changes and late Discord commits can defeat correlation. */
async function recoverCreation(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Work['channel']
): Promise<Progress> {
  const marker = row.creation_marker;
  const categoryId = row.creation_category_id;
  if (!marker || !categoryId) {
    throw new DiscordRecoveryUnavailable('Discord creation is missing its saved marker or category.');
  }
  let channels: Awaited<ReturnType<DiscordRest['listChannels']>>;
  try {
    channels = await rest.listChannels(row.guild_id);
  } catch (error) {
    if (
      error instanceof DiscordPaused ||
      (error instanceof DiscordFailure && (error.status === 0 || error.status === 429 || error.status >= 500))
    ) {
      throw error;
    }
    throw new DiscordRecoveryUnavailable(
      'Discord did not provide a usable channel listing. An administrator must inspect Discord.'
    );
  }
  const matches = channels.filter((channel) => channel.name === marker);
  if (matches.length > 0) {
    const match = matches[0]!;
    if (
      matches.length !== 1 ||
      match.type !== 2 ||
      match.parent_id !== categoryId ||
      (match.guild_id && match.guild_id !== row.guild_id)
    ) {
      throw new DiscordRecoveryUnavailable(
        'Discord has conflicting creation markers. An administrator must inspect Discord.'
      );
    }
    const adopted = await ctx.runMutation(internal.playDiscord.created, { ...claim, discordChannelId: match.id });
    return adopted ? 'continue' : 'complete';
  }
  throw new DiscordRecoveryUnavailable(
    'Discord did not show a matching channel. An administrator must inspect Discord before any new creation.'
  );
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
    return await recoverCreation(ctx, rest, claim, work.channel);
  }
  if (work.remove) {
    await removeRoom(ctx, rest, claim, work.channel);
    return 'complete';
  }
  if (work.channel.state === 'pending') {
    if (work.channel.channel_id) {
      if (work.channel.creation_name_pending) {
        return await renameRoom(ctx, rest, claim, work);
      }
      const url = await rest.invite(work.channel.channel_id);
      await ctx.runMutation(internal.playDiscord.invited, { ...claim, url });
    } else {
      return await createRoom(ctx, rest, claim, work.channel);
    }
    return 'continue';
  }
  if (work.channel.channel_id && !!work.channel.renamed_ended !== work.ended) {
    return await renameRoom(ctx, rest, claim, work);
  }
  return 'complete';
}

function unexpectedFailure(error: unknown) {
  if (error instanceof NoDiscordChannelRoom) {
    return { error: error.message, kind: 'no-room' };
  }
  if (error instanceof DiscordRecoveryUnavailable) {
    return { error: error.message, kind: 'recovery-unavailable' };
  }
  if (error instanceof ZodError) {
    return { error: 'Discord returned an invalid channel response. Retry is scheduled.', kind: 'invalid-response' };
  }
  return { error: 'Discord channel work failed before it could finish. Retry is scheduled.', kind: 'unexpected' };
}

function failureForRelease(error: unknown) {
  if (error instanceof DiscordRecoveryUnavailable) {
    return { error: error.message, needsAttention: true };
  }
  if (error instanceof DiscordFailure) {
    return {
      error: error.message,
      retryAfterMs: error.retryAfterMs,
      retryAt: error.retryAt,
      retryGlobal: error.global,
    };
  }
  if (error instanceof DiscordPaused) {
    return { error: error.message, paused: true };
  }
  const diagnostic = unexpectedFailure(error);
  console.error('Discord channel work failed.', { kind: diagnostic.kind });
  return { error: diagnostic.error };
}

/** A leased reconciliation creates or removes the game channel and saves completed steps. */
export const reconcile = internalAction({
  args: { channelId: v.id('play_game_discord_channels') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = discordConfiguration();
    if (!config) {
      return null;
    }
    const row = await ctx.runMutation(internal.playDiscord.claim, args);
    if (!row) {
      return null;
    }
    const claim = { ...args, lease: row.lease };
    const rest = new DiscordRest(config.token, `Dune Play game ${row.game_id}`, discordCooldown(ctx));
    let failure: ReturnType<typeof failureForRelease> | undefined;
    try {
      for (let step = 0; step < 5; step += 1) {
        if ((await reconcileStep(ctx, rest, claim)) === 'complete') {
          break;
        }
      }
    } catch (error) {
      failure = failureForRelease(error);
    } finally {
      await ctx.runMutation(internal.playDiscord.release, {
        ...claim,
        attempted: rest.requestsMade > 0,
        operation: row.retry.operation,
        ...failure,
      });
    }
    return null;
  },
});
