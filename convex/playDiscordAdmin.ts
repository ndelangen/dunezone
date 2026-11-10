import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { z } from 'zod';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { adminQuery, mutation } from './functions';
import { DiscordRest, discordConfiguration } from './lib/discordRest';
import { discordEnabled } from './lib/discordStatus';
import { DISCORD_LEASE, requestDiscordDeletion } from './lib/playDiscord';
import { requireAdminUserId } from './lib/policy';

const row = v.object({
  _id: v.id('play_game_discord_channels'),
  game_id: v.id('play_games'),
  guild_id: v.string(),
  channel_id: v.optional(v.string()),
  state: v.union(
    v.literal('pending'),
    v.literal('creating'),
    v.literal('ready'),
    v.literal('deleting'),
    v.literal('deleted')
  ),
  created_at: v.number(),
  cleanup_at: v.number(),
  waiting_for_empty: v.optional(v.boolean()),
  error: v.optional(v.string()),
  gameSlug: v.optional(v.string()),
  gameName: v.optional(v.string()),
});
const nudgeError = v.object({
  game_id: v.id('play_games'),
  gameSlug: v.optional(v.string()),
  gameName: v.optional(v.string()),
  toSeat: v.string(),
  at: v.number(),
  state: v.union(v.literal('failed'), v.literal('uncertain'), v.literal('sending')),
  error: v.optional(v.string()),
});
const orphan = v.object({ id: v.string(), name: v.string(), parent_id: v.string(), guild_id: v.string() });
const snowflake = z.string().regex(/^\d{1,20}$/);
const discordChannel = z.object({
  id: snowflake,
  name: z.string().max(100),
  type: z.number(),
  parent_id: snowflake.nullish(),
  guild_id: snowflake.optional(),
});
const ORPHAN_AGE = DISCORD_LEASE + 4 * 60_000;

export const dashboard = adminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    configured: v.boolean(),
    enabled: v.boolean(),
    channels: paginationResultValidator(row),
    nudgeErrors: v.array(nudgeError),
  }),
  handler: async (ctx, { paginationOpts }) => {
    if (paginationOpts.numItems < 1 || paginationOpts.numItems > 100) {
      throw new Error('Page size must be between 1 and 100.');
    }
    const games = new Map<Id<'play_games'>, Promise<Doc<'play_games'> | null>>();
    function getGame(id: Id<'play_games'>) {
      let game = games.get(id);
      if (!game) {
        game = ctx.db.get(id);
        games.set(id, game);
      }
      return game;
    }
    const channels = await ctx.db.query('play_game_discord_channels').order('desc').paginate(paginationOpts);
    const page = await Promise.all(
      channels.page.map(async (channel) => {
        const game = await getGame(channel.game_id);
        return {
          _id: channel._id,
          game_id: channel.game_id,
          guild_id: channel.guild_id,
          channel_id: channel.channel_id,
          state: channel.state,
          created_at: channel.created_at,
          cleanup_at: channel.cleanup_at,
          waiting_for_empty:
            game?.directory?.stage === 'finished' &&
            !!channel.channel_id &&
            (channel.state === 'pending' || channel.state === 'ready'),
          error: channel.error,
          gameSlug: game?.slug,
          gameName: game?.name,
        };
      })
    );
    const failed = await ctx.db
      .query('play_game_discord_nudges')
      .withIndex('by_state_at', (q) => q.eq('state', 'failed'))
      .order('desc')
      .take(10);
    const uncertain = await ctx.db
      .query('play_game_discord_nudges')
      .withIndex('by_state_at', (q) => q.eq('state', 'uncertain'))
      .order('desc')
      .take(10);
    const sending = await ctx.db
      .query('play_game_discord_nudges')
      .withIndex('by_state_at', (q) => q.eq('state', 'sending'))
      .order('desc')
      .take(10);
    const latest = [...failed, ...uncertain, ...sending].sort((a, b) => b.at - a.at).slice(0, 10);
    const nudgeErrors = await Promise.all(
      latest.map(async ({ game_id, to_seat, at, state, error }) => {
        const game = await getGame(game_id);
        return {
          game_id,
          gameSlug: game?.slug,
          gameName: game?.name,
          toSeat: to_seat,
          at,
          state: state as 'failed' | 'uncertain' | 'sending',
          error,
        };
      })
    );
    return {
      configured: !!discordConfiguration(),
      enabled: await discordEnabled(ctx),
      channels: { ...channels, page },
      nudgeErrors,
    };
  },
});

export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { enabled }) => {
    await requireAdminUserId(ctx);
    const settings = await ctx.db.query('play_discord_settings').unique();
    if (settings) {
      await ctx.db.patch(settings._id, { enabled, updated_at: Date.now() });
    } else {
      await ctx.db.insert('play_discord_settings', { enabled, updated_at: Date.now() });
    }
    return null;
  },
});

export const requestDelete = mutation({
  args: { channelId: v.id('play_game_discord_channels') },
  returns: v.null(),
  handler: async (ctx, { channelId }) => {
    await requireAdminUserId(ctx);
    if (!(await discordEnabled(ctx))) {
      throw new Error('Enable Discord before removing channels.');
    }
    const channel = await ctx.db.get(channelId);
    if (!channel || channel.state === 'deleted') {
      throw new Error('Channel is no longer tracked.');
    }
    if (channel.state === 'creating' && !channel.channel_id) {
      throw new Error('Creation has an unknown result. Check Discord first.');
    }
    await requestDiscordDeletion(ctx, channel);
    return null;
  },
});

export const enabledForAdmin = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await requireAdminUserId(ctx);
    return await discordEnabled(ctx);
  },
});

/* Actions recheck both admin identity and tracked IDs at the database boundary. */
export const untracked = internalQuery({
  args: { ids: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { ids }) => {
    await requireAdminUserId(ctx);
    if (ids.length > 500) {
      throw new Error('Too many channels.');
    }
    const tracked = await Promise.all(
      ids.map((id) =>
        ctx.db
          .query('play_game_discord_channels')
          .withIndex('by_channel_id', (q) => q.eq('channel_id', id))
          .first()
      )
    );
    return ids.filter((_, i) => !tracked[i]);
  },
});

function rest(ctx: ActionCtx, token: string) {
  return new DiscordRest(token, 'Dune Play admin orphan cleanup', {
    until: () => ctx.runQuery(internal.playDiscord.cooldownUntil, {}),
    hold: (until) => ctx.runMutation(internal.playDiscord.holdRequests, { until }),
  });
}
function oldEnough(id: string) {
  return Number((BigInt(id) >> 22n) + 1_420_070_400_000n) <= Date.now() - ORPHAN_AGE;
}

export const refreshOrphans = action({
  args: {},
  returns: v.array(orphan),
  handler: async (ctx): Promise<Infer<typeof orphan>[]> => {
    await ctx.runQuery(internal.playDiscordAdmin.untracked, { ids: [] });
    const config = discordConfiguration();
    if (!config) {
      throw new Error('Discord is not configured.');
    }
    const channels = z
      .array(discordChannel)
      .max(500)
      .parse(await rest(ctx, config.token).request('GET', `/guilds/${config.guildId}/channels`));
    const eligible = channels.filter(
      (c) => c.type === 2 && c.parent_id && config.categoryIds.includes(c.parent_id) && oldEnough(c.id)
    );
    const untrackedIds: string[] = await ctx.runQuery(internal.playDiscordAdmin.untracked, {
      ids: eligible.map((c) => c.id),
    });
    const ids = new Set(untrackedIds);
    return eligible
      .filter((c) => ids.has(c.id))
      .slice(0, 100)
      .map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id!, guild_id: config.guildId }));
  },
});

export const deleteOrphan = action({
  args: { channelId: v.string() },
  returns: v.null(),
  handler: async (ctx, { channelId }): Promise<null> => {
    if (!(await ctx.runQuery(internal.playDiscordAdmin.enabledForAdmin, {}))) {
      throw new Error('Enable Discord before removing channels.');
    }
    if (!snowflake.safeParse(channelId).success || !oldEnough(channelId)) {
      throw new Error('Channel is not eligible for orphan removal.');
    }
    const config = discordConfiguration();
    if (!config) {
      throw new Error('Discord is not configured.');
    }
    const client = rest(ctx, config.token);
    const channel = discordChannel.parse(await client.request('GET', `/channels/${channelId}`));
    if (
      channel.id !== channelId ||
      channel.guild_id !== config.guildId ||
      channel.type !== 2 ||
      !channel.parent_id ||
      !config.categoryIds.includes(channel.parent_id)
    ) {
      throw new Error('Channel is outside the configured Games categories.');
    }
    const untracked = await ctx.runQuery(internal.playDiscordAdmin.untracked, { ids: [channelId] });
    if (untracked.length !== 1) {
      throw new Error('Channel is tracked by a game.');
    }
    await client.remove(channelId);
    return null;
  },
});
