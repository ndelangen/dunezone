import type { FunctionReturnType } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { ZodError } from 'zod';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { discordCooldown } from './lib/discordCooldown';
import { DiscordFailure, DiscordPaused, DiscordRest, discordConfiguration } from './lib/discordRest';
import { retryCreationCategory } from './lib/discordRetry';
import type { discordRetryOperation } from './lib/discordRetry';

type Claim = { channelId: Id<'play_game_discord_channels'>; lease: string };
type Work = NonNullable<FunctionReturnType<typeof internal.playDiscord.work>>;
type Progress = 'continue' | 'complete';
type Perform = <T>(
  operation: Infer<typeof discordRetryOperation>,
  request: () => Promise<T>,
  categoryId?: string
) => Promise<T>;

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
  categoryId: string,
  perform: Perform
) {
  let channelId: string;
  try {
    channelId = await perform(
      'create',
      () => rest.create(row.guild_id, categoryId, row.creation_marker ?? `dune-play-${row.game_id}`),
      categoryId
    );
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
    await perform('delete', () => rest.remove(channelId));
  }
}

async function createRoom(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Doc<'play_game_discord_channels'>,
  perform: Perform
): Promise<Progress> {
  const retryCategory = retryCreationCategory(row);
  const categories = retryCategory
    ? [retryCategory]
    : await perform('categories', () => rest.categories(row.guild_id, row.category_ids));
  for (const categoryId of categories) {
    if (!(await ctx.runMutation(internal.playDiscord.startCreation, { ...claim, categoryId }))) {
      return 'complete';
    }
    try {
      await postCreation(ctx, rest, claim, row, categoryId, perform);
    } catch (error) {
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
    return 'continue';
  }
  throw new NoDiscordChannelRoom();
}

/** A listing proves only what is visible. Administrator changes and late Discord commits can defeat correlation. */
async function recoverCreation(
  ctx: ActionCtx,
  rest: DiscordRest,
  claim: Claim,
  row: Work['channel'],
  perform: Perform
): Promise<Progress> {
  const marker = row.creation_marker;
  const categoryId = row.creation_category_id;
  if (!marker || !categoryId) {
    throw new DiscordRecoveryUnavailable(
      'This older creation has no saved marker. An administrator must inspect Discord.'
    );
  }
  const channels = await perform('recover', () => rest.listChannels(row.guild_id));
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
        'Discord has conflicting creation markers. Recovery will check again later.'
      );
    }
    const adopted = await ctx.runMutation(internal.playDiscord.created, { ...claim, discordChannelId: match.id });
    return adopted ? 'continue' : 'complete';
  }
  if (
    !channels.some(
      (channel) =>
        channel.id === categoryId && channel.type === 4 && (!channel.guild_id || channel.guild_id === row.guild_id)
    )
  ) {
    throw new DiscordRecoveryUnavailable('The saved Discord category is not visible. Recovery will check again later.');
  }
  const replace = await ctx.runMutation(internal.playDiscord.replaceMissingCreation, {
    ...claim,
    marker,
    categoryId,
    attempt: row.creation_attempt ?? 0,
  });
  if (!replace) {
    return 'complete';
  }
  await postCreation(ctx, rest, claim, row, categoryId, perform);
  return 'continue';
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
    return await recoverCreation(ctx, rest, claim, work.channel, perform);
  }
  if (work.remove) {
    await removeRoom(ctx, rest, claim, work.channel, perform);
    return 'complete';
  }
  if (work.channel.state === 'pending') {
    if (work.channel.channel_id) {
      if (work.channel.creation_name_pending) {
        return await renameRoom(ctx, rest, claim, work, perform);
      }
      const url = await perform('invite', () => rest.invite(work.channel.channel_id!));
      await ctx.runMutation(internal.playDiscord.invited, { ...claim, url });
    } else {
      return await createRoom(ctx, rest, claim, work.channel, perform);
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
    const rest = new DiscordRest(config.token, `Dune Play game ${row.game_id}`, discordCooldown(ctx));
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
          retryAt?: number;
          retryGlobal?: boolean;
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
      const diagnostic =
        error instanceof NoDiscordChannelRoom || error instanceof DiscordRecoveryUnavailable
          ? error.message
          : error instanceof ZodError
            ? 'Discord returned an invalid channel response. Retry is scheduled.'
            : 'Discord channel work failed before it could finish. Retry is scheduled.';
      if (!(error instanceof DiscordFailure) && !(error instanceof DiscordPaused)) {
        console.error('Discord channel work failed.', {
          kind:
            error instanceof NoDiscordChannelRoom
              ? 'no-room'
              : error instanceof DiscordRecoveryUnavailable
                ? 'recovery-unavailable'
                : error instanceof ZodError
                  ? 'invalid-response'
                  : 'unexpected',
        });
      }
      failure = {
        error: error instanceof DiscordFailure || error instanceof DiscordPaused ? error.message : diagnostic,
        ...(error instanceof DiscordFailure
          ? {
              retryAfterMs: error.retryAfterMs,
              retryAt: error.retryAt,
              retryGlobal: error.global,
              retryOperation,
              retryCategoryId,
            }
          : {}),
      };
    } finally {
      await ctx.runMutation(internal.playDiscord.release, { ...claim, ...failure });
    }
    return null;
  },
});
