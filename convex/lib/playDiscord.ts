import type { PlayDiscordMenu } from '../../src/shared/play/discord';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalAccount } from './accountIdentity';
import { accountStateOf } from './accountLifecycle';
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

export function discordGameOpen(game: Doc<'play_games'>) {
  return (
    game.state === 'ready' &&
    game.fixture_key === undefined &&
    game.ruleset_id !== undefined &&
    game.directory?.stage !== 'finished' &&
    game.directory?.stage !== 'discarded'
  );
}

export async function discordSeated(
  ctx: QueryCtx,
  game: Doc<'play_games'>,
  userId: Id<'users'>,
  retainFinished = false
) {
  if (
    game.state !== 'ready' ||
    game.fixture_key !== undefined ||
    !game.ruleset_id ||
    (!retainFinished && !discordGameOpen(game))
  ) {
    return false;
  }
  const user = await ctx.db.get(userId);
  if (!user || accountStateOf(user) !== 'active') {
    return false;
  }
  for (const seat of game.directory?.seats ?? []) {
    const actor = ctx.db.normalizeId('users', seat.userId);
    if (actor && (await canonicalAccount(ctx, actor))?._id === userId) {
      return true;
    }
  }
  return false;
}

/** Merges can retain several Discord methods; the oldest one is the account's stable voice identity. */
export async function discordAccount(ctx: QueryCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', userId).eq('provider', 'discord'))
    .first();
}

export async function discordGrantAllowed(ctx: QueryCtx, grant: Doc<'play_game_discord_grants'>) {
  if (!grant.desired) {
    return false;
  }
  const [game, user, auth] = await Promise.all([
    ctx.db.get(grant.game_id),
    canonicalAccount(ctx, grant.user_id),
    ctx.db.get(grant.auth_account_id),
  ]);
  return !!(
    game &&
    user &&
    auth &&
    auth.provider === 'discord' &&
    auth.providerAccountId === grant.discord_user_id &&
    auth.userId === user._id &&
    (await discordSeated(ctx, game, user._id, grant.state === 'granted'))
  );
}

export async function wakeDiscord(ctx: MutationCtx, channel: Doc<'play_game_discord_channels'>) {
  if (channel.state === 'deleted') {
    return;
  }
  const next = Math.max(Date.now(), channel.retry_after ?? 0);
  await ctx.db.patch(channel._id, { next_attempt_at: next });
  await ctx.scheduler.runAt(next, internal.playDiscordActions.reconcile, { channelId: channel._id });
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

/** Only accepted directory deliveries reach this function; old summaries cannot restore a seat's access. */
export async function syncDiscordDirectory(ctx: MutationCtx, game: Doc<'play_games'>) {
  const channel = await discordChannel(ctx, game._id);
  if (!channel || channel.state === 'deleted' || channel.state === 'deleting') {
    return;
  }
  const terminal = game.directory?.stage === 'finished' || game.directory?.stage === 'discarded';
  const endedAt = channel.ended_at ?? (terminal ? Date.now() : undefined);
  const cleanupAt = Math.min(
    (game.directory?.lastActivityAt ?? channel.created_at) + 14 * DISCORD_DAY,
    endedAt === undefined ? Infinity : endedAt + DISCORD_DAY
  );
  await ctx.db.patch(channel._id, { ended_at: endedAt, cleanup_at: cleanupAt });
  await ctx.scheduler.runAfter(0, internal.playDiscord.syncSeats, { gameId: game._id, cursor: null });
  if (cleanupAt < channel.next_attempt_at) {
    await ctx.db.patch(channel._id, { next_attempt_at: cleanupAt });
  }
}

export async function revokeDiscordAccount(
  ctx: MutationCtx,
  userId: Id<'users'>,
  disconnectedAuthIds?: Id<'authAccounts'>[],
  cursor?: string | null
) {
  const query = ctx.db
    .query('play_game_discord_grants')
    .withIndex('by_user_id_desired', (q) => q.eq('user_id', userId).eq('desired', true));
  /* The account mutation already paginates session cutoffs; pagination belongs to our continuation alone. */
  const first = cursor === undefined ? await query.take(DISCORD_BATCH) : null;
  const grants = first
    ? { page: first, isDone: first.length < DISCORD_BATCH, continueCursor: null }
    : await query.paginate({ numItems: DISCORD_BATCH, cursor: cursor ?? null });
  for (const grant of grants.page) {
    if (disconnectedAuthIds && !disconnectedAuthIds.includes(grant.auth_account_id)) {
      continue;
    }
    await ctx.db.patch(grant._id, {
      desired: false,
      needs_sync: true,
      retry_at: 0,
      revision: grant.revision + 1,
      request_state: 'error',
      request_error: 'Discord access was removed.',
      request_url: undefined,
    });
    const channel = await discordChannel(ctx, grant.game_id);
    if (channel) {
      await wakeDiscord(ctx, channel);
    }
  }
  if (!grants.isDone) {
    await ctx.scheduler.runAfter(0, internal.playDiscord.revokeAccount, {
      userId,
      disconnectedAuthIds,
      cursor: grants.continueCursor,
    });
  }
}

/** The game's existing page query carries the voice state, with no Discord IDs, credentials or additional subscription. */
export async function discordMenu(
  ctx: QueryCtx,
  game: Doc<'play_games'>,
  userId: Id<'users'>
): Promise<PlayDiscordMenu | null> {
  if (!discordConfiguration() || !(await discordSeated(ctx, game, userId))) {
    return null;
  }
  const channel = await discordChannel(ctx, game._id);
  if (!channel || channel.state === 'deleted' || channel.state === 'deleting') {
    return null;
  }
  const auth = await discordAccount(ctx, userId);
  if (!auth) {
    const profile = await ctx.db
      .query('profiles')
      .withIndex('by_user_id', (q) => q.eq('user_id', userId))
      .unique();
    return profile ? { kind: 'connect', profileSlug: profile.slug } : null;
  }
  const grant = await ctx.db
    .query('play_game_discord_grants')
    .withIndex('by_game_id_discord_user_id', (q) =>
      q.eq('game_id', game._id).eq('discord_user_id', auth.providerAccountId)
    )
    .unique();
  if (!grant || grant.auth_account_id !== auth._id || !grant.request_id) {
    return { kind: 'join', request: null };
  }
  const id = grant.request_id;
  if (grant.request_state === 'ready' && grant.request_url && grant.request_kind) {
    return { kind: 'join', request: { id, state: 'ready', url: grant.request_url, kind: grant.request_kind } };
  }
  if (grant.request_state === 'error') {
    return {
      kind: 'join',
      request: { id, state: 'error', message: grant.request_error ?? 'Discord is unavailable. Try again shortly.' },
    };
  }
  return { kind: 'join', request: { id, state: 'pending' } };
}
