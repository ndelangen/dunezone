import type { PlayDiscordMenu } from '../../src/shared/play/discord';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { discordConfiguration } from './discordRest';
import { discordEnabled } from './discordStatus';

export const DISCORD_DAY = 24 * 60 * 60_000;
export const DISCORD_BATCH = 32;
export const DISCORD_CREATOR_LIMIT = 3;
export const DISCORD_RETRY = 15 * 60_000;
/*
 * Longer than Convex's 30-minute default-runtime action limit plus the 15-second transport timeout.
 * See https://docs.convex.dev/production/state/limits#execution-time-and-scheduling.
 */
export const DISCORD_LEASE = 31 * 60_000;

export async function discordChannel(ctx: QueryCtx, gameId: Id<'play_games'>) {
  return await ctx.db
    .query('play_game_discord_channels')
    .withIndex('by_game_id', (q) => q.eq('game_id', gameId))
    .unique();
}

/** The account limit counts its games that still have a live bot-created channel. */
export async function discordVoiceAtLimit(ctx: QueryCtx, creatorId: Id<'users'>) {
  if ((await ctx.db.get(creatorId))?.account_merge_operation_id) {
    return true;
  }
  let count = 0;
  const games = ctx.db
    .query('play_games')
    .withIndex('by_creator_id_discord_voice', (q) => q.eq('creator_id', creatorId).eq('discord_voice', true));
  for await (const game of games) {
    const channel = await discordChannel(ctx, game._id);
    if (channel && channel.state !== 'deleted' && channel.state !== 'deleting') {
      count += 1;
      if (count >= DISCORD_CREATOR_LIMIT) {
        return true;
      }
    }
  }
  return false;
}

function discordGameFinished(game: Doc<'play_games'>) {
  return game.directory?.stage === 'finished' || game.directory?.stage === 'discarded';
}

/** A game stops offering voice when its channel leaves the live set. */
export async function clearDiscordVoice(ctx: MutationCtx, gameId: Id<'play_games'>) {
  const game = await ctx.db.get(gameId);
  if (game?.discord_voice === true) {
    await ctx.db.patch(gameId, { discord_voice: false });
  }
}

/** Reservation and game confirmation commit together; repeated confirmations cannot reserve a second room. */
export async function reserveDiscordChannel(ctx: MutationCtx, game: Doc<'play_games'>) {
  if (await discordChannel(ctx, game._id)) {
    return;
  }
  const config = discordConfiguration();
  if (
    !config ||
    !(await discordEnabled(ctx)) ||
    game.discord_voice !== true ||
    game.fixture_key !== undefined ||
    !game.ruleset_id
  ) {
    await clearDiscordVoice(ctx, game._id);
    return;
  }
  if (!game.creator_id || (await discordVoiceAtLimit(ctx, game.creator_id))) {
    await ctx.db.patch(game._id, { discord_voice: false });
    return;
  }
  const now = Date.now();
  const channelId = await ctx.db.insert('play_game_discord_channels', {
    game_id: game._id,
    guild_id: config.guildId,
    category_ids: config.categoryIds,
    state: 'pending',
    created_at: now,
    cleanup_at: now + 14 * DISCORD_DAY,
    next_attempt_at: now,
  });
  await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId });
}

/** Manual retirement uses the same durable deletion path as an expired game channel. */
export async function requestDiscordDeletion(ctx: MutationCtx, channel: Doc<'play_game_discord_channels'>) {
  if (channel.state !== 'creating') {
    await clearDiscordVoice(ctx, channel.game_id);
  }
  await ctx.db.patch(channel._id, {
    /* Keep an in-flight create able to save its returned ID before the deletion request is applied. */
    state: channel.state === 'creating' ? 'creating' : 'deleting',
    deletion_requested_at: Date.now(),
    cleanup_at: Date.now(),
    next_attempt_at: Date.now(),
    invite_url: undefined,
    error: undefined,
    work_revision: (channel.work_revision ?? 0) + 1,
  });
  await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId: channel._id });
}

/** Accepted stage changes wake cleanup immediately, even when an earlier action still owns the lease. */
export async function syncDiscordDirectory(ctx: MutationCtx, game: Doc<'play_games'>) {
  if (game.discord_voice !== true) {
    return;
  }
  const channel = await discordChannel(ctx, game._id);
  if (!channel || channel.state === 'deleted' || channel.state === 'deleting') {
    return;
  }
  const stage = game.directory?.stage;
  const endedAt = stage === 'finished' ? (channel.ended_at ?? Date.now()) : undefined;
  const inactiveAt = (game.directory?.lastActivityAt ?? channel.created_at) + 14 * DISCORD_DAY;
  const cleanupAt = stage === 'discarded' ? Date.now() : inactiveAt;
  const changed = stage === 'discarded' || (endedAt !== undefined) !== (channel.ended_at !== undefined);
  await ctx.db.patch(channel._id, {
    ended_at: endedAt,
    cleanup_at: cleanupAt,
    ...(changed
      ? { next_attempt_at: Date.now(), work_revision: (channel.work_revision ?? 0) + 1 }
      : { next_attempt_at: Math.min(channel.next_attempt_at, cleanupAt) }),
  });
  if (changed) {
    await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId: channel._id });
  }
}

/** Every viewer sees the same invite; Discord accounts and game seats do not affect access. */
export async function discordMenu(ctx: QueryCtx, game: Doc<'play_games'>): Promise<PlayDiscordMenu | null> {
  if (
    !discordConfiguration() ||
    game.discord_voice !== true ||
    game.state !== 'ready' ||
    game.fixture_key !== undefined ||
    !game.ruleset_id ||
    discordGameFinished(game)
  ) {
    return null;
  }
  const channel = await discordChannel(ctx, game._id);
  return channel?.state === 'ready' && channel.invite_url ? { url: channel.invite_url } : null;
}
