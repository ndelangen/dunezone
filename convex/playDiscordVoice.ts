import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation } from './functions';
import { discordEnabled } from './lib/discordStatus';
import { requestDiscordDeletion } from './lib/playDiscord';
import { VOICE_BATCH, VOICE_OBSERVATION_MAX_AGE, voiceCandidateValidator } from './lib/playDiscordVoice';

async function eligible(ctx: QueryCtx, row: Doc<'play_game_discord_channels'>) {
  if (row.state !== 'ready' || !row.channel_id || !row.renamed_ended || row.deletion_requested_at !== undefined) {
    return false;
  }
  const game = await ctx.db.get(row.game_id);
  return (
    game?.state === 'ready' &&
    game.discord_voice === true &&
    game.ruleset_id !== undefined &&
    game.fixture_key === undefined &&
    game.directory?.stage === 'finished'
  );
}

/** Advancing every scanned row, including occupied rooms, gives later batches their turn next hour. */
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
    await ctx.db.patch(row._id, { voice_checked_at: Date.now() });
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
  args: { channels: v.array(voiceCandidateValidator), observedAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const age = Date.now() - args.observedAt;
    if (
      args.channels.length > VOICE_BATCH ||
      !Number.isFinite(age) ||
      age < 0 ||
      age > VOICE_OBSERVATION_MAX_AGE ||
      !(await discordEnabled(ctx))
    ) {
      return null;
    }
    for (const channel of args.channels) {
      const row = await ctx.db.get(channel.channelId);
      if (
        row &&
        row.channel_id === channel.discordChannelId &&
        row.guild_id === channel.guildId &&
        (row.work_revision ?? 0) === channel.revision &&
        (await eligible(ctx, row))
      ) {
        await requestDiscordDeletion(ctx, row);
      }
    }
    return null;
  },
});
