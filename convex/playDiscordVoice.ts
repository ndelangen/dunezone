import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation } from './functions';
import { discordEnabled } from './lib/discordStatus';
import { markDiscordDeleted, requestDiscordDeletion } from './lib/playDiscord';
import {
  VOICE_BATCH,
  VOICE_OBSERVATION_MAX_AGE,
  canCheckDiscordVoiceChannel,
  canCheckDiscordVoiceGame,
  voiceCandidateValidator,
} from './lib/playDiscordVoice';

async function eligible(ctx: QueryCtx, row: Doc<'play_game_discord_channels'>) {
  if (!canCheckDiscordVoiceChannel(row)) {
    return false;
  }
  return canCheckDiscordVoiceGame(await ctx.db.get(row.game_id));
}

/** A full batch rotates to give later rooms their turn; a smaller set fits without any rotation writes. */
export async function voiceCandidates(ctx: MutationCtx) {
  if (!(await discordEnabled(ctx))) {
    return [];
  }
  const rows = await ctx.db
    .query('play_game_discord_channels')
    .withIndex('by_state_renamed_ended_voice_checked_at', (q) => q.eq('state', 'ready').eq('renamed_ended', true))
    .take(VOICE_BATCH);
  const result = [];
  for (const row of rows) {
    if (rows.length === VOICE_BATCH) {
      await ctx.db.patch(row._id, { voice_checked_at: Date.now() });
    }
    if (await eligible(ctx, row)) {
      result.push({
        channelId: row._id,
        discordChannelId: row.channel_id!,
        guildId: row.guild_id,
        revision: row.work_revision ?? 0,
      });
    }
  }
  return result;
}

/** Resolve the observed room inside the deletion transaction, before changing any lifecycle state. */
async function observedChannel(ctx: QueryCtx, observed: Infer<typeof voiceCandidateValidator>) {
  const row = await ctx.db.get(observed.channelId);
  if (!row) {
    return null;
  }
  if ((row.work_revision ?? 0) !== observed.revision) {
    return null;
  }
  if (row.channel_id !== observed.discordChannelId || row.guild_id !== observed.guildId) {
    return null;
  }
  return (await eligible(ctx, row)) ? row : null;
}

/** Empty or paused deployments do not start a Node action. */
export const checkDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const channels = await voiceCandidates(ctx);
    if (channels.length > 0) {
      await ctx.scheduler.runAfter(0, internal.playDiscordVoiceActions.cleanup, { channels });
    }
    return null;
  },
});

/** A stale snapshot cannot retire a continued game or a later finish of that game. */
export const reportEmpty = internalMutation({
  args: {
    channels: v.array(voiceCandidateValidator),
    missingChannels: v.optional(v.array(voiceCandidateValidator)),
    observedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const age = Date.now() - args.observedAt;
    if (args.channels.length + (args.missingChannels?.length ?? 0) > VOICE_BATCH) {
      return null;
    }
    if (!Number.isFinite(age)) {
      return null;
    }
    if (age < 0 || age > VOICE_OBSERVATION_MAX_AGE) {
      return null;
    }
    if (!(await discordEnabled(ctx))) {
      return null;
    }
    for (const channel of args.channels) {
      const row = await observedChannel(ctx, channel);
      if (row) {
        await requestDiscordDeletion(ctx, row);
      }
    }
    for (const channel of args.missingChannels ?? []) {
      const row = await observedChannel(ctx, channel);
      if (row) {
        await markDiscordDeleted(ctx, row);
      }
    }
    return null;
  },
});
