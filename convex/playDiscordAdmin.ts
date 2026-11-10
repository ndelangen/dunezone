import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import type { Infer } from 'convex/values';
import { z } from 'zod';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalQuery } from './_generated/server';
import type { ActionCtx, QueryCtx } from './_generated/server';
import { adminQuery, mutation } from './functions';
import { discordCooldown } from './lib/discordCooldown';
import { DiscordFailure, DiscordRest, discordConfiguration } from './lib/discordRest';
import { discordNeedsAttention, retryDiscordChannel } from './lib/discordRetry';
import { discordEnabled } from './lib/discordStatus';
import { discordChannel as trackedDiscordChannel, DISCORD_LEASE, requestDiscordDeletion } from './lib/playDiscord';
import { canCheckDiscordVoiceChannel, canCheckDiscordVoiceGame } from './lib/playDiscordVoice';
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
  cleanup_status: v.union(
    v.literal('scheduled'),
    v.literal('awaiting_setup'),
    v.literal('awaiting_rename'),
    v.literal('waiting_for_empty'),
    v.literal('deleting'),
    v.literal('deleted')
  ),
  lease_until: v.optional(v.number()),
  next_attempt_at: v.number(),
  needs_attention: v.boolean(),
  waiting_for_empty: v.optional(v.boolean()),
  error: v.optional(v.string()),
  gameSlug: v.optional(v.string()),
  gameName: v.optional(v.string()),
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

function cleanupStatus(channel: Doc<'play_game_discord_channels'>, game: Doc<'play_games'> | null) {
  if (channel.state === 'deleted') {
    return 'deleted' as const;
  }
  if (channel.state === 'deleting' || channel.deletion_requested_at !== undefined) {
    return 'deleting' as const;
  }
  if (game?.directory?.stage !== 'finished') {
    return 'scheduled' as const;
  }
  if (canCheckDiscordVoiceGame(game) && canCheckDiscordVoiceChannel(channel)) {
    return 'waiting_for_empty' as const;
  }
  return channel.state === 'ready' ? ('awaiting_rename' as const) : ('awaiting_setup' as const);
}

export const dashboard = adminQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    observed_at: v.number(),
    configured: v.boolean(),
    enabled: v.boolean(),
    channels: paginationResultValidator(row),
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
          cleanup_status: cleanupStatus(channel, game),
          lease_until: channel.lease_until,
          next_attempt_at: channel.next_attempt_at,
          needs_attention: discordNeedsAttention(channel),
          waiting_for_empty: canCheckDiscordVoiceGame(game) && canCheckDiscordVoiceChannel(channel),
          error: channel.error,
          gameSlug: game?.slug,
          gameName: game?.name,
        };
      })
    );
    return {
      observed_at: Date.now(),
      configured: !!discordConfiguration(),
      enabled: await discordEnabled(ctx),
      channels: { ...channels, page },
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

/** A manual retry queues the same guarded reconciliation as cron; it never changes creation state. */
export const requestRetry = mutation({
  args: { channelId: v.id('play_game_discord_channels') },
  returns: v.null(),
  handler: async (ctx, { channelId }) => {
    await requireAdminUserId(ctx);
    if (!(await discordEnabled(ctx))) {
      throw new Error('Enable Discord before retrying channels.');
    }
    const channel = await ctx.db.get(channelId);
    if (!channel || channel.state === 'deleted') {
      throw new Error('Channel is no longer tracked.');
    }
    await retryDiscordChannel(ctx, channel);
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

async function matchesActiveCreation(ctx: QueryCtx, candidate: Infer<typeof orphan>) {
  const prefix = 'dune-play-';
  if (!candidate.name.startsWith(prefix)) {
    return false;
  }
  const gameId = ctx.db.normalizeId('play_games', candidate.name.slice(prefix.length));
  if (!gameId) {
    return false;
  }
  const channel = await trackedDiscordChannel(ctx, gameId);
  if (channel?.state !== 'creating' || channel.creation_marker !== candidate.name) {
    return false;
  }
  return channel.guild_id === candidate.guild_id && channel.creation_category_id === candidate.parent_id;
}

async function isTracked(ctx: QueryCtx, candidate: Infer<typeof orphan>) {
  const tracked = await ctx.db
    .query('play_game_discord_channels')
    .withIndex('by_channel_id', (q) => q.eq('channel_id', candidate.id))
    .first();
  return !!tracked || (await matchesActiveCreation(ctx, candidate));
}

/* Both checks share a snapshot, so adoption cannot slip between the ID and marker reads. */
export const untracked = internalQuery({
  args: { candidates: v.array(orphan) },
  returns: v.array(v.string()),
  handler: async (ctx, { candidates }) => {
    await requireAdminUserId(ctx);
    if (candidates.length > 500) {
      throw new Error('Too many channels.');
    }
    const tracked = await Promise.all(candidates.map((candidate) => isTracked(ctx, candidate)));
    return candidates.filter((_, i) => !tracked[i]).map((candidate) => candidate.id);
  },
});

function rest(ctx: ActionCtx, token: string) {
  return new DiscordRest(token, 'Dune Play admin orphan cleanup', discordCooldown(ctx));
}
/** Interactive admin requests retain their two short retries; lifecycle retries belong to the scheduler. */
async function retryAdminRequest<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof DiscordFailure) || error.status !== 429 || attempt >= 2 || error.retryAfterMs > 5000) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, error.retryAfterMs));
    }
  }
}
function oldEnough(id: string) {
  return Number((BigInt(id) >> 22n) + 1_420_070_400_000n) <= Date.now() - ORPHAN_AGE;
}

export const refreshOrphans = action({
  args: {},
  returns: v.array(orphan),
  handler: async (ctx): Promise<Infer<typeof orphan>[]> => {
    await ctx.runQuery(internal.playDiscordAdmin.untracked, { candidates: [] });
    const config = discordConfiguration();
    if (!config) {
      throw new Error('Discord is not configured.');
    }
    const channels = z
      .array(discordChannel)
      .max(500)
      .parse(
        await retryAdminRequest(() => rest(ctx, config.token).request('GET', `/guilds/${config.guildId}/channels`))
      );
    const eligible = channels
      .filter((c) => c.type === 2 && c.parent_id && config.categoryIds.includes(c.parent_id) && oldEnough(c.id))
      .map((c) => ({ id: c.id, name: c.name, parent_id: c.parent_id!, guild_id: c.guild_id ?? config.guildId }))
      .filter((c) => c.guild_id === config.guildId);
    const untrackedIds: string[] = await ctx.runQuery(internal.playDiscordAdmin.untracked, { candidates: eligible });
    const ids = new Set(untrackedIds);
    return eligible.filter((c) => ids.has(c.id)).slice(0, 100);
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
    const channel = discordChannel.parse(
      await retryAdminRequest(() => client.request('GET', `/channels/${channelId}`))
    );
    if (
      channel.id !== channelId ||
      channel.guild_id !== config.guildId ||
      channel.type !== 2 ||
      !channel.parent_id ||
      !config.categoryIds.includes(channel.parent_id)
    ) {
      throw new Error('Channel is outside the configured Games categories.');
    }
    const { id, name, parent_id, guild_id } = channel;
    await retryAdminRequest(async () => {
      const untracked = await ctx.runQuery(internal.playDiscordAdmin.untracked, {
        candidates: [{ id, name, parent_id, guild_id }],
      });
      if (untracked.length !== 1) {
        throw new Error('Channel is tracked by a game.');
      }
      await client.remove(channelId);
    });
    return null;
  },
});
