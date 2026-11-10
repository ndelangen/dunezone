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

export async function discordVoiceAtLimit(ctx: QueryCtx, creatorId: Id<'users'>) {
  /* A merge moves ownership in batches. Hold reservations until both accounts' rows have moved. */
  if ((await ctx.db.get(creatorId))?.account_merge_operation_id) {
    return true;
  }
  let count = 0;
  for (const state of ['pending', 'creating', 'ready'] as const) {
    const channels = await ctx.db
      .query('play_game_discord_channels')
      .withIndex('by_creator_id_state', (q) => q.eq('creator_id', creatorId).eq('state', state))
      .take(DISCORD_CREATOR_LIMIT);
    count += channels.length;
    if (count >= DISCORD_CREATOR_LIMIT) {
      return true;
    }
  }
  return false;
}

function discordGameFinished(game: Doc<'play_games'>) {
  return game.directory?.stage === 'finished' || game.directory?.stage === 'discarded';
}

/** Reservation and game confirmation commit together; repeated confirmations cannot reserve a second room. */
export async function reserveDiscordChannel(ctx: MutationCtx, game: Doc<'play_games'>) {
  const config = discordConfiguration();
  if (
    !config ||
    !(await discordEnabled(ctx)) ||
    game.discord_voice !== true ||
    game.fixture_key !== undefined ||
    !game.ruleset_id ||
    (await discordChannel(ctx, game._id))
  ) {
    return;
  }
  if (!game.creator_id || (await discordVoiceAtLimit(ctx, game.creator_id))) {
    await ctx.db.patch(game._id, { discord_voice: false });
    return;
  }
  const now = Date.now();
  const channelId = await ctx.db.insert('play_game_discord_channels', {
    game_id: game._id,
    creator_id: game.creator_id,
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
  await ctx.db.patch(channel._id, {
    /* Keep an in-flight create able to save its returned ID before the deletion request is applied. */
    state: channel.state === 'creating' ? 'creating' : 'deleting',
    deletion_requested_at: Date.now(),
    cleanup_at: Date.now(),
    next_attempt_at: Date.now(),
    invite_url: undefined,
    retry: undefined,
    error: undefined,
    work_revision: (channel.work_revision ?? 0) + 1,
  });
  await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId: channel._id });
}

/** A confirmed deletion or Unknown Channel response ends tracked work without another Discord request. */
export async function markDiscordDeleted(ctx: MutationCtx, channel: Doc<'play_game_discord_channels'>) {
  await ctx.db.patch(channel._id, {
    state: 'deleted',
    deleted_at: Date.now(),
    invite_url: undefined,
    retry_after: undefined,
    retry: undefined,
    error: undefined,
  });
}

/** Accepted stage changes wake cleanup immediately, even when an earlier action still owns the lease. */
export async function syncDiscordDirectory(ctx: MutationCtx, game: Doc<'play_games'>, previouslyFinished: boolean) {
  if (game.discord_voice !== true) {
    return;
  }
  const channel = await discordChannel(ctx, game._id);
  if (!channel || channel.state === 'deleted' || channel.state === 'deleting') {
    return;
  }
  const stage = game.directory?.stage;
  const inactiveAt = (game.directory?.lastActivityAt ?? channel.created_at) + 14 * DISCORD_DAY;
  const cleanupAt = stage === 'discarded' ? Date.now() : inactiveAt;
  const changed = stage === 'discarded' || (stage === 'finished') !== previouslyFinished;
  await ctx.db.patch(channel._id, {
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
