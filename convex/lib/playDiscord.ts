import type { PlayDiscordMenu } from '../../src/shared/play/discord';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { discordConfiguration } from './discordRest';

export const DISCORD_DAY = 24 * 60 * 60_000;
export const DISCORD_BATCH = 32;
export const DISCORD_RETRY = 15 * 60_000;
/* Longer than Convex's ten-minute action lifetime and the transport timeout, so a replacement never overlaps a live owner. */
export const DISCORD_LEASE = 11 * 60_000;

export async function discordChannel(ctx: QueryCtx, gameId: Id<'play_games'>) {
  return await ctx.db
    .query('play_game_discord_channels')
    .withIndex('by_game_id', (q) => q.eq('game_id', gameId))
    .unique();
}

function discordGameFinished(game: Doc<'play_games'>) {
  return game.directory?.stage === 'finished' || game.directory?.stage === 'discarded';
}

/** Reservation and game confirmation commit together; repeated confirmations cannot reserve a second room. */
export async function reserveDiscordChannel(ctx: MutationCtx, game: Doc<'play_games'>) {
  const config = discordConfiguration();
  if (!config || game.fixture_key !== undefined || !game.ruleset_id || (await discordChannel(ctx, game._id))) {
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

/** Only accepted directory deliveries update the room's cleanup deadline. */
export async function syncDiscordDirectory(ctx: MutationCtx, game: Doc<'play_games'>) {
  const channel = await discordChannel(ctx, game._id);
  if (!channel || channel.state === 'deleted' || channel.state === 'deleting') {
    return;
  }
  const endedAt = channel.ended_at ?? (discordGameFinished(game) ? Date.now() : undefined);
  const inactiveAt = (game.directory?.lastActivityAt ?? channel.created_at) + 14 * DISCORD_DAY;
  const cleanupAt = endedAt === undefined ? inactiveAt : Math.min(inactiveAt, endedAt + DISCORD_DAY);
  await ctx.db.patch(channel._id, { ended_at: endedAt, cleanup_at: cleanupAt });
  if (cleanupAt < channel.next_attempt_at) {
    await ctx.db.patch(channel._id, { next_attempt_at: cleanupAt });
  }
}

/** Every viewer sees the same invite; Discord accounts and game seats do not affect access. */
export async function discordMenu(ctx: QueryCtx, game: Doc<'play_games'>): Promise<PlayDiscordMenu | null> {
  if (
    !discordConfiguration() ||
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
