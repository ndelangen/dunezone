import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { docValidator } from './lib/collaborativeAccessValidators';
import { discordConfiguration } from './lib/discordRest';
import { livePlaySession, playCredential } from './lib/playAuthorization';
import {
  DISCORD_BATCH,
  DISCORD_LEASE,
  DISCORD_RETRY,
  discordAccount,
  discordChannel,
  discordGrantAllowed,
  discordSeated,
  revokeDiscordAccount,
  wakeDiscord,
} from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';

const channelValidator = docValidator('play_game_discord_channels');
const grantValidator = docValidator('play_game_discord_grants');
const claimArgs = { channelId: v.id('play_game_discord_channels'), lease: v.string() };

/** A shared deadline also stops requests from actions already working on other games. */
export const cooldownUntil = internalQuery({
  args: {},
  returns: v.number(),
  handler: async (ctx) => (await ctx.db.query('play_discord_cooldown').unique())?.blocked_until ?? 0,
});

export const holdRequests = internalMutation({
  args: { until: v.number() },
  returns: v.null(),
  handler: async (ctx, { until }) => {
    const row = await ctx.db.query('play_discord_cooldown').unique();
    if (!row) {
      await ctx.db.insert('play_discord_cooldown', { blocked_until: until });
    } else if (until > row.blocked_until) {
      await ctx.db.patch(row._id, { blocked_until: until });
    }
    return null;
  },
});

/** The authenticated request records intent; only the scheduled internal action contacts Discord. */
export const join = mutation({
  args: { gameId: v.id('play_games') },
  returns: v.string(),
  handler: async (ctx, { gameId }) => {
    const session = await livePlaySession(ctx);
    const game = await ctx.db.get(gameId);
    const channel = await discordChannel(ctx, gameId);
    if (
      !discordConfiguration() ||
      !session ||
      !game ||
      !channel ||
      channel.state === 'deleted' ||
      channel.state === 'deleting' ||
      channel.cleanup_at <= Date.now() ||
      !(await discordSeated(ctx, game, session.userId))
    ) {
      throw new Error("Only seated players can join this game's voice chat.");
    }
    if (channel.state === 'creating' && (channel.lease_until ?? 0) <= Date.now()) {
      throw new Error('The Discord room needs recovery. Try again later.');
    }
    const auth = await discordAccount(ctx, session.userId);
    if (!auth || !/^\d+$/.test(auth.providerAccountId)) {
      throw new Error('Connect Discord in your profile first.');
    }
    if (!(await playRateLimiter.limit(ctx, 'playDiscordJoin', { key: session.userId })).ok) {
      throw new Error('Wait a moment before trying Discord again.');
    }
    const existing = await ctx.db
      .query('play_game_discord_grants')
      .withIndex('by_game_id_discord_user_id', (q) =>
        q.eq('game_id', gameId).eq('discord_user_id', auth.providerAccountId)
      )
      .unique();
    const requestId = playCredential();
    const fields = {
      game_id: gameId,
      user_id: session.userId,
      discord_user_id: auth.providerAccountId,
      auth_account_id: auth._id,
      desired: true,
      needs_sync: true,
      retry_at: 0,
      revision: (existing?.revision ?? 0) + 1,
      state: existing?.state === 'granted' ? ('granted' as const) : ('pending' as const),
      request_id: requestId,
      request_state: 'pending' as const,
      request_url: undefined,
      request_kind: undefined,
      request_error: undefined,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert('play_game_discord_grants', fields);
    }
    await wakeDiscord(ctx, channel);
    return requestId;
  },
});

export const claim = internalMutation({
  args: { channelId: v.id('play_game_discord_channels') },
  returns: v.union(v.null(), channelValidator),
  handler: async (ctx, { channelId }) => {
    const row = await ctx.db.get(channelId);
    if (
      !discordConfiguration() ||
      !row ||
      row.state === 'deleted' ||
      (row.lease_until ?? 0) > Date.now() ||
      (row.retry_after ?? 0) > Date.now()
    ) {
      return null;
    }
    const cooldown = await ctx.db.query('play_discord_cooldown').unique();
    if (cooldown && cooldown.blocked_until > Date.now()) {
      await ctx.db.patch(row._id, { next_attempt_at: cooldown.blocked_until });
      return null;
    }
    const lease = playCredential();
    const until = Date.now() + DISCORD_LEASE;
    await ctx.db.patch(row._id, { lease, lease_until: until, next_attempt_at: until });
    return { ...row, lease, lease_until: until, next_attempt_at: until };
  },
});

export const work = internalMutation({
  args: claimArgs,
  returns: v.union(
    v.null(),
    v.object({ channel: channelValidator, name: v.string(), remove: v.boolean(), grants: v.array(grantValidator) })
  ),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!discordConfiguration() || !channel || channel.lease !== args.lease || channel.state === 'deleted') {
      return null;
    }
    const game = await ctx.db.get(channel.game_id);
    const remove =
      channel.state === 'deleting' ||
      !game ||
      game.fixture_key !== undefined ||
      game.state !== 'ready' ||
      channel.cleanup_at <= Date.now();
    const grants = [];
    for (const desired of [false, true]) {
      grants.push(
        ...(await ctx.db
          .query('play_game_discord_grants')
          .withIndex('by_game_id_needs_sync_desired_retry_at', (q) =>
            q.eq('game_id', channel.game_id).eq('needs_sync', true).eq('desired', desired).lte('retry_at', Date.now())
          )
          .take(DISCORD_BATCH - grants.length))
      );
      if (grants.length === DISCORD_BATCH) {
        break;
      }
    }
    return { channel, name: game?.name ?? 'Dune Play', remove, grants };
  },
});

/** Persist before POST: a process that dies after Discord accepts the request must never blindly repeat it. */
export const startCreation = internalMutation({
  args: claimArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !discordConfiguration() ||
      row?.lease !== args.lease ||
      row.state !== 'pending' ||
      row.cleanup_at <= Date.now()
    ) {
      return false;
    }
    await ctx.db.patch(row._id, {
      state: 'creating',
      error: 'Channel creation has no confirmed result. Check Discord before retrying it.',
    });
    return true;
  },
});

export const created = internalMutation({
  args: { ...claimArgs, discordChannelId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (row?.lease !== args.lease || row.state !== 'creating') {
      return false;
    }
    await ctx.db.patch(row._id, { channel_id: args.discordChannelId, state: 'ready', error: undefined });
    return true;
  },
});

/** Only a definite HTTP rejection returns creation to pending; an ambiguous response stays creating. */
export const rejectedCreation = internalMutation({
  args: claimArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (row?.lease === args.lease && row.state === 'creating') {
      await ctx.db.patch(row._id, { state: 'pending' });
    }
    return null;
  },
});

export const grantWork = internalMutation({
  args: { ...claimArgs, grantId: v.id('play_game_discord_grants') },
  returns: v.union(v.null(), v.object({ grant: grantValidator, allow: v.boolean(), admit: v.boolean() })),
  handler: async (ctx, args) => {
    const [channel, grant] = await Promise.all([ctx.db.get(args.channelId), ctx.db.get(args.grantId)]);
    if (
      !discordConfiguration() ||
      !channel ||
      channel.lease !== args.lease ||
      !grant ||
      grant.game_id !== channel.game_id
    ) {
      return null;
    }
    const allow =
      channel.state === 'ready' && channel.cleanup_at > Date.now() && (await discordGrantAllowed(ctx, grant));
    return { grant, allow, admit: allow && (await discordGrantAllowed(ctx, { ...grant, state: 'pending' })) };
  },
});

export const grantFinished = internalMutation({
  args: {
    ...claimArgs,
    grantId: v.id('play_game_discord_grants'),
    revision: v.number(),
    state: v.union(v.literal('pending'), v.literal('granted'), v.literal('revoked')),
    url: v.optional(v.string()),
    kind: v.optional(v.union(v.literal('channel'), v.literal('invite'))),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const [channel, grant] = await Promise.all([ctx.db.get(args.channelId), ctx.db.get(args.grantId)]);
    if (!channel || channel.lease !== args.lease || !grant || grant.game_id !== channel.game_id) {
      return false;
    }
    const allowed =
      !!discordConfiguration() && channel.cleanup_at > Date.now() && (await discordGrantAllowed(ctx, grant));
    if (grant.revision !== args.revision || (args.state === 'revoked' ? allowed : !allowed)) {
      return false;
    }
    const ready =
      args.state !== 'revoked' &&
      args.url &&
      args.kind &&
      (await discordGrantAllowed(ctx, { ...grant, state: 'pending' }));
    await ctx.db.patch(grant._id, {
      state: args.state,
      needs_sync: false,
      ...(args.state === 'granted' ? { granted_at: Date.now() } : {}),
      ...(args.state === 'revoked' ? { revoked_at: Date.now(), desired: false } : {}),
      ...(grant.request_state === 'pending'
        ? {
            request_state: ready ? ('ready' as const) : ('error' as const),
            request_url: ready ? args.url : undefined,
            request_kind: ready ? args.kind : undefined,
            request_error: ready ? undefined : 'You no longer have access to this voice room.',
          }
        : {}),
    });
    return true;
  },
});

export const removed = internalMutation({
  args: claimArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (row?.lease === args.lease) {
      await ctx.db.patch(row._id, { state: 'deleted', deleted_at: Date.now(), error: undefined });
    }
    return null;
  },
});

/** Commits retirement while its deadline is still due; later activity cannot race the Discord DELETE. */
export const beginDeletion = internalMutation({
  args: claimArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !discordConfiguration() ||
      !row ||
      row.lease !== args.lease ||
      row.state === 'creating' ||
      row.state === 'deleted'
    ) {
      return false;
    }
    const game = await ctx.db.get(row.game_id);
    if (row.state !== 'deleting' && game?.state === 'ready' && row.cleanup_at > Date.now()) {
      return false;
    }
    await ctx.db.patch(row._id, { state: 'deleting' });
    return true;
  },
});

export const grantFailed = internalMutation({
  args: { ...claimArgs, grantId: v.id('play_game_discord_grants'), revision: v.number(), retryAfterMs: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [row, grant] = await Promise.all([ctx.db.get(args.channelId), ctx.db.get(args.grantId)]);
    if (row?.lease === args.lease && grant?.revision === args.revision) {
      await ctx.db.patch(grant._id, {
        retry_at: Date.now() + Math.max(DISCORD_RETRY, args.retryAfterMs),
        ...(grant.request_state === 'pending'
          ? { request_state: 'error' as const, request_error: 'Discord is unavailable. Try again shortly.' }
          : {}),
      });
    }
    return null;
  },
});

export const release = internalMutation({
  args: { ...claimArgs, error: v.optional(v.string()), retryAfterMs: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (!row || row.lease !== args.lease) {
      return null;
    }
    const dirty = await ctx.db
      .query('play_game_discord_grants')
      .withIndex('by_game_id_needs_sync_retry_at', (q) => q.eq('game_id', row.game_id).eq('needs_sync', true))
      .first();
    const next =
      args.error || row.state === 'creating'
        ? Date.now() + Math.max(DISCORD_RETRY, args.retryAfterMs ?? 0)
        : dirty
          ? Math.min(row.cleanup_at, Math.max(Date.now(), dirty.retry_at))
          : row.cleanup_at;
    await ctx.db.patch(row._id, {
      lease: undefined,
      lease_until: undefined,
      next_attempt_at: next,
      retry_after: args.retryAfterMs ? Date.now() + args.retryAfterMs : row.retry_after,
      error: row.state === 'creating' ? row.error : args.error,
    });
    if (args.error) {
      const pending = await ctx.db
        .query('play_game_discord_grants')
        .withIndex('by_game_id_needs_sync', (q) => q.eq('game_id', row.game_id).eq('needs_sync', true))
        .take(DISCORD_BATCH);
      for (const grant of pending) {
        if (grant.request_state === 'pending') {
          await ctx.db.patch(grant._id, {
            request_state: 'error',
            request_error: 'Discord is unavailable. Try again shortly.',
          });
        }
      }
    }
    if (row.state !== 'deleted' && next <= Date.now()) {
      await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId: row._id });
    }
    return null;
  },
});

export const syncSeats = internalMutation({
  args: { gameId: v.id('play_games'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { gameId, cursor }) => {
    const channel = await discordChannel(ctx, gameId);
    if (!channel || channel.state === 'deleted') {
      return null;
    }
    const page = await ctx.db
      .query('play_game_discord_grants')
      .withIndex('by_game_id_desired', (q) => q.eq('game_id', gameId).eq('desired', true))
      .paginate({ cursor, numItems: DISCORD_BATCH });
    let changed = false;
    for (const grant of page.page) {
      if (!(await discordGrantAllowed(ctx, grant))) {
        await ctx.db.patch(grant._id, {
          desired: false,
          needs_sync: true,
          retry_at: 0,
          revision: grant.revision + 1,
          request_url: undefined,
        });
        changed = true;
      }
    }
    if (changed) {
      await wakeDiscord(ctx, channel);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.playDiscord.syncSeats, { gameId, cursor: page.continueCursor });
    }
    return null;
  },
});

export const revokeAccount = internalMutation({
  args: {
    userId: v.id('users'),
    disconnectedAuthIds: v.optional(v.array(v.id('authAccounts'))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, { userId, disconnectedAuthIds, cursor }) => {
    await revokeDiscordAccount(ctx, userId, disconnectedAuthIds, cursor);
    return null;
  },
});

/** Indexed batches advance due rows before scheduling, so one failing room cannot hold up later cleanup. */
export const retryDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!discordConfiguration()) {
      return null;
    }
    for (const state of ['pending', 'ready', 'deleting'] as const) {
      const due: Doc<'play_game_discord_channels'>[] = await ctx.db
        .query('play_game_discord_channels')
        .withIndex('by_state_next_attempt_at', (q) => q.eq('state', state).lte('next_attempt_at', Date.now()))
        .take(DISCORD_BATCH);
      for (const row of due) {
        await ctx.db.patch(row._id, { next_attempt_at: Date.now() + DISCORD_RETRY });
        await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId: row._id });
      }
      if (due.length === DISCORD_BATCH) {
        await ctx.scheduler.runAfter(0, internal.playDiscord.retryDue, {});
      }
    }
    return null;
  },
});
