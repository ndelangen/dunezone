import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { playSendNudgeRequestSchema, playPublishNudgeResultSchema } from '../src/shared/play/nudges';
import { internal } from './_generated/api';
import { action } from './_generated/server';
import { internalMutation } from './functions';
import { canonicalAccount } from './lib/accountIdentity';
import { accountStateOf } from './lib/accountLifecycle';
import { discordConfiguration, DiscordFailure, DiscordRest } from './lib/discordRest';
import { discordEnabled } from './lib/discordStatus';
import { authenticatedPlayRequest } from './lib/playAuthorization';
import { discordChannel } from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';

const delivery = v.object({
  channelId: v.string(),
  discordUserId: v.string(),
  gameName: v.string(),
  fromFactionName: v.string(),
});

/** Resolve current seats and spend the only nudge cooldown atomically; no delivery record is stored. */
export const prepare = internalMutation({
  args: zodToConvex(playSendNudgeRequestSchema),
  returns: v.object({ ok: v.boolean(), delivery: v.union(v.null(), delivery) }),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playSendNudgeRequestSchema);
    if (!request) {
      return { ok: false, delivery: null };
    }
    const { game, args } = request;
    const dropped = { ok: true, delivery: null };
    if (
      game.state !== 'ready' ||
      game.discord_voice !== true ||
      game.fixture_key !== undefined ||
      game.ruleset_id === undefined ||
      (game.directory_stage !== 'setup' && game.directory_stage !== 'play') ||
      args.fromSeat === args.toSeat ||
      !(await discordEnabled(ctx))
    ) {
      return dropped;
    }
    const from = game.directory?.seats.find((seat) => seat.seat === args.fromSeat);
    const target = game.directory?.seats.find((seat) => seat.seat === args.toSeat);
    const senderId = from ? ctx.db.normalizeId('users', from.userId) : null;
    const sender = senderId ? await canonicalAccount(ctx, senderId) : null;
    const userId = target ? ctx.db.normalizeId('users', target.userId) : null;
    const account = userId ? await canonicalAccount(ctx, userId) : null;
    const channel = await discordChannel(ctx, game._id);
    if (
      !from?.faction ||
      from.userId !== args.fromUserId ||
      from.faction.id !== args.fromFactionId ||
      target?.userId !== args.toUserId ||
      !sender ||
      sender.isAnonymous ||
      accountStateOf(sender) !== 'active' ||
      !account ||
      account.isAnonymous ||
      accountStateOf(account) !== 'active' ||
      channel?.state !== 'ready' ||
      !channel.channel_id ||
      channel.cleanup_at <= Date.now()
    ) {
      return dropped;
    }
    const linked = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', account._id).eq('provider', 'discord'))
      .first();
    if (!linked || !/^\d+$/.test(linked.providerAccountId)) {
      return dropped;
    }
    if (!(await playRateLimiter.limit(ctx, 'playNudgePerSeat', { key: `${game._id}:${args.toSeat}` })).ok) {
      return dropped;
    }
    return {
      ok: true,
      delivery: {
        channelId: channel.channel_id,
        discordUserId: linked.providerAccountId,
        gameName: game.name,
        fromFactionName: from.faction.name,
      },
    };
  },
});

/** A saved message earns one best-effort POST. Failures are logged and dropped. */
export const sendNudge = action({
  args: zodToConvex(playSendNudgeRequestSchema),
  returns: zodToConvex(playPublishNudgeResultSchema),
  handler: async (ctx, args): Promise<{ ok: boolean }> => {
    try {
      const configuration = discordConfiguration();
      if (!configuration) {
        return { ok: true };
      }
      const prepared = await ctx.runMutation(internal.playDiscordNudges.prepare, args);
      const work = prepared.delivery;
      if (work) {
        const rest = new DiscordRest(configuration.token, 'Dune Play nudge', {
          until: () => ctx.runQuery(internal.playDiscord.cooldownUntil, {}),
          hold: (until) => ctx.runMutation(internal.playDiscord.holdRequests, { until }),
        });
        await rest.nudge(work.channelId, work.discordUserId, work.fromFactionName, work.gameName);
      }
      return { ok: prepared.ok };
    } catch (error) {
      /* Never log request arguments, Discord bodies, account IDs or chat contents. */
      console.error(
        'Discord nudge dropped.',
        error instanceof DiscordFailure ? error.message : 'Nudge request failed.'
      );
      return { ok: true };
    }
  },
});
