import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  PLAY_NUDGE_MAX_AGE_MS,
  PLAY_NUDGE_MAX_ATTEMPTS,
  playPublishNudgeRequestSchema,
  playPublishNudgeResultSchema,
} from '../src/shared/play/nudges';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { canonicalAccount } from './lib/accountIdentity';
import { accountStateOf } from './lib/accountLifecycle';
import { discordEnabled } from './lib/discordStatus';
import { authenticatedPlayRequest } from './lib/playAuthorization';
import { discordChannel } from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';

const deliveryArgs = { id: v.id('play_game_discord_nudges'), nudgeId: v.string() };
const deliveryValidator = v.object({
  channelId: v.string(),
  discordUserId: v.string(),
  gameName: v.string(),
  fromFactionName: v.string(),
});

function fresh(at: number) {
  const now = Date.now();
  return at <= now + 10_000 && at + PLAY_NUDGE_MAX_AGE_MS > now;
}

function liveGame(game: Doc<'play_games'> | null) {
  return (
    game?.state === 'ready' &&
    game.discord_voice === true &&
    game.fixture_key === undefined &&
    game.ruleset_id !== undefined &&
    game.directory_stage !== 'finished' &&
    game.directory_stage !== 'discarded'
  );
}

/** Resolve merges, but a deleted or disconnected account never receives a delayed mention. */
async function linkedDiscord(ctx: QueryCtx, actorId: Id<'users'>) {
  const account = await canonicalAccount(ctx, actorId);
  if (!account || account.isAnonymous || accountStateOf(account) !== 'active') {
    return null;
  }
  const linked = await ctx.db
    .query('authAccounts')
    .withIndex('userIdAndProvider', (q) => q.eq('userId', account._id).eq('provider', 'discord'))
    .first();
  return linked && /^\d+$/.test(linked.providerAccountId) ? linked : null;
}

/** Only the authenticated room publishes intent; ordinary browser clients have no game credential. */
export const publishNudge = mutation({
  args: zodToConvex(playPublishNudgeRequestSchema),
  returns: zodToConvex(playPublishNudgeResultSchema),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playPublishNudgeRequestSchema);
    if (!request) {
      return { ok: false };
    }
    const { game, args } = request;
    if (!fresh(args.at) || !liveGame(game) || !(await discordEnabled(ctx))) {
      return { ok: true };
    }
    const current = await ctx.db
      .query('play_game_discord_nudges')
      .withIndex('by_game_id_to_seat', (q) => q.eq('game_id', game._id).eq('to_seat', args.toSeat))
      .unique();
    if (current?.nudge_id === args.nudgeId) {
      return { ok: true };
    }
    const channel = await discordChannel(ctx, game._id);
    if (channel?.state !== 'ready' || !channel.channel_id || channel.cleanup_at <= Date.now()) {
      return { ok: true };
    }
    const userId = ctx.db.normalizeId('users', args.toUserId);
    const linked = userId ? await linkedDiscord(ctx, userId) : null;
    if (!linked || !userId) {
      return { ok: true };
    }
    const quota = await playRateLimiter.limit(ctx, 'playNudgePerSeat', { key: `${game._id}:${args.toSeat}` });
    if (!quota.ok) {
      return { ok: true };
    }
    const value = {
      game_id: game._id,
      to_seat: args.toSeat,
      nudge_id: args.nudgeId,
      from_faction_name: args.fromFactionName,
      to_user_id: userId,
      auth_account_id: linked._id,
      at: args.at,
      state: 'pending' as const,
      attempts: 0,
    };
    const id = current?._id ?? (await ctx.db.insert('play_game_discord_nudges', value));
    if (current) {
      await ctx.db.replace(id, value);
    }
    await ctx.scheduler.runAfter(0, internal.playDiscordNudgeActions.deliver, { id, nudgeId: args.nudgeId });
    await ctx.scheduler.runAt(args.at + PLAY_NUDGE_MAX_AGE_MS, internal.playDiscordNudges.expire, {
      id,
      nudgeId: args.nudgeId,
    });
    return { ok: true };
  },
});

/** Persist the uncertain outcome before POST; a crashed action cannot send the same event again. */
export const start = internalMutation({
  args: deliveryArgs,
  returns: v.union(v.null(), deliveryValidator),
  handler: async (ctx, { id, nudgeId }) => {
    const row = await ctx.db.get(id);
    if (!row || row.nudge_id !== nudgeId || row.state !== 'pending') {
      return null;
    }
    const game = await ctx.db.get(row.game_id);
    const channel = await discordChannel(ctx, row.game_id);
    const linked = row.to_user_id ? await linkedDiscord(ctx, row.to_user_id) : null;
    const seatedActor = game?.directory?.seats.find((seat) => seat.seat === row.to_seat)?.userId;
    const seatedId = seatedActor ? ctx.db.normalizeId('users', seatedActor) : null;
    const sameOccupant =
      seatedId !== null &&
      (seatedId === row.to_user_id || (await canonicalAccount(ctx, seatedId))?._id === linked?.userId);
    if (
      !fresh(row.at) ||
      row.attempts >= PLAY_NUDGE_MAX_ATTEMPTS ||
      !liveGame(game) ||
      !(await discordEnabled(ctx)) ||
      channel?.state !== 'ready' ||
      !channel.channel_id ||
      channel.cleanup_at <= Date.now() ||
      !linked ||
      !sameOccupant ||
      linked._id !== row.auth_account_id
    ) {
      await ctx.db.patch(row._id, { state: 'dropped', to_user_id: undefined, auth_account_id: undefined });
      return null;
    }
    await ctx.db.patch(row._id, {
      state: 'sending',
      attempts: row.attempts + 1,
      error: 'The Discord ping has no confirmed result. It will not be sent again.',
    });
    return {
      channelId: channel.channel_id,
      discordUserId: linked.providerAccountId,
      gameName: game!.name,
      fromFactionName: row.from_faction_name,
    };
  },
});

/** Delivery identity lasts two minutes; sanitized failures remain available to admins for one day. */
export const expire = internalMutation({
  args: deliveryArgs,
  returns: v.null(),
  handler: async (ctx, { id, nudgeId }) => {
    const row = await ctx.db.get(id);
    if (!row || row.nudge_id !== nudgeId) {
      return null;
    }
    const keepError = row.state === 'failed' || row.state === 'uncertain' || row.state === 'sending';
    const expiresAt = row.at + 24 * 60 * 60_000;
    if (keepError && expiresAt > Date.now()) {
      await ctx.db.patch(id, {
        state: row.state === 'sending' ? 'uncertain' : row.state,
        to_user_id: undefined,
        auth_account_id: undefined,
      });
      await ctx.scheduler.runAt(expiresAt, internal.playDiscordNudges.expire, { id, nudgeId });
    } else {
      await ctx.db.delete(id);
    }
    return null;
  },
});

export const settle = internalMutation({
  args: {
    ...deliveryArgs,
    outcome: v.union(
      v.literal('sent'),
      v.literal('failed'),
      v.literal('uncertain'),
      v.literal('rate_limited'),
      v.literal('dropped')
    ),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
    retryAfterMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (!row || row.nudge_id !== args.nudgeId || row.state !== 'sending') {
      return null;
    }
    const retryAt = Date.now() + Math.max(1000, args.retryAfterMs ?? 0);
    if (
      args.outcome === 'rate_limited' &&
      row.attempts < PLAY_NUDGE_MAX_ATTEMPTS &&
      retryAt < row.at + PLAY_NUDGE_MAX_AGE_MS
    ) {
      await ctx.db.patch(row._id, { state: 'pending', error: undefined });
      await ctx.scheduler.runAt(retryAt, internal.playDiscordNudgeActions.deliver, {
        id: row._id,
        nudgeId: row.nudge_id,
      });
    } else {
      await ctx.db.patch(row._id, {
        state: args.outcome === 'rate_limited' ? 'dropped' : args.outcome,
        message_id: args.messageId,
        error: args.error,
        to_user_id: undefined,
        auth_account_id: undefined,
      });
    }
    return null;
  },
});
