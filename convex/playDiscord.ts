import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import { internalMutation } from './functions';
import { docValidator } from './lib/collaborativeAccessValidators';
import { discordEnabled } from './lib/discordStatus';
import { playCredential } from './lib/playAuthorization';
import { clearDiscordVoice, DISCORD_BATCH, DISCORD_LEASE, DISCORD_RETRY } from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';

const channelValidator = docValidator('play_game_discord_channels');
const claimArgs = { channelId: v.id('play_game_discord_channels'), lease: v.string() };

/** A shared deadline also stops requests from actions already working on other games. */
export const cooldownUntil = internalQuery({
  args: {},
  returns: v.union(v.number(), v.null()),
  handler: async (ctx) =>
    (await discordEnabled(ctx)) ? ((await ctx.db.query('play_discord_cooldown').unique())?.blocked_until ?? 0) : null,
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

export const claim = internalMutation({
  args: { channelId: v.id('play_game_discord_channels') },
  returns: v.union(v.null(), channelValidator),
  handler: async (ctx, { channelId }) => {
    const row = await ctx.db.get(channelId);
    if (
      !(await discordEnabled(ctx)) ||
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
    await ctx.db.patch(row._id, {
      lease,
      lease_until: until,
      lease_revision: row.work_revision ?? 0,
      next_attempt_at: until,
    });
    return { ...row, lease, lease_until: until, next_attempt_at: until };
  },
});

function retirementDue(channel: Doc<'play_game_discord_channels'>, game: Doc<'play_games'> | null) {
  if (channel.state === 'deleting' || channel.deletion_requested_at !== undefined) {
    return true;
  }
  if (game?.state !== 'ready' || game.fixture_key !== undefined || game.ruleset_id === undefined) {
    return true;
  }
  if (game.directory?.stage === 'discarded') {
    return true;
  }
  if (game.directory?.stage === 'finished') {
    /* A game that ended before creation needs no channel. Existing channels wait for an empty voice observation. */
    return channel.state === 'pending' && !channel.channel_id;
  }
  return channel.cleanup_at <= Date.now();
}

export const work = internalMutation({
  args: claimArgs,
  returns: v.union(
    v.null(),
    v.object({ channel: channelValidator, name: v.string(), ended: v.boolean(), remove: v.boolean() })
  ),
  handler: async (ctx, args) => {
    const channel = await ctx.db.get(args.channelId);
    if (!(await discordEnabled(ctx)) || !channel || channel.lease !== args.lease || channel.state === 'deleted') {
      return null;
    }
    const game = await ctx.db.get(channel.game_id);
    const ended = game?.directory?.stage === 'finished';
    const name = game?.name ?? 'Dune Play';
    return {
      channel,
      name: ended ? `${name.slice(0, 92)} (ended)` : name.slice(0, 100),
      ended,
      remove: retirementDue(channel, game),
    };
  },
});

/** Persist before POST: a process that dies after Discord accepts the request must never blindly repeat it. */
export const startCreation = internalMutation({
  args: claimArgs,
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !(await discordEnabled(ctx)) ||
      row?.lease !== args.lease ||
      row.state !== 'pending' ||
      row.channel_id !== undefined ||
      retirementDue(row, await ctx.db.get(row.game_id))
    ) {
      return false;
    }
    const quota = await playRateLimiter.limit(ctx, 'discordChannelCreateGlobal');
    if (!quota.ok) {
      await ctx.db.patch(row._id, { retry_after: Date.now() + Math.max(1, quota.retryAfter ?? DISCORD_RETRY) });
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
    await ctx.db.patch(row._id, { channel_id: args.discordChannelId, state: 'pending', error: undefined });
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

/** An invite failure retries this step using the saved channel instead of creating another room. */
export const invited = internalMutation({
  args: { ...claimArgs, url: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !(await discordEnabled(ctx)) ||
      row?.lease !== args.lease ||
      row.state !== 'pending' ||
      !row.channel_id ||
      retirementDue(row, await ctx.db.get(row.game_id))
    ) {
      return false;
    }
    await ctx.db.patch(row._id, { invite_url: args.url, state: 'ready', error: undefined });
    return true;
  },
});

/** Record the completed PATCH even if the game changed while Discord answered; release then schedules the new name. */
export const renamed = internalMutation({
  args: { ...claimArgs, ended: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (row?.lease === args.lease) {
      await ctx.db.patch(row._id, { renamed_ended: args.ended });
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
      !(await discordEnabled(ctx)) ||
      !row ||
      row.lease !== args.lease ||
      row.state === 'creating' ||
      row.state === 'deleted'
    ) {
      return false;
    }
    if (!retirementDue(row, await ctx.db.get(row.game_id))) {
      return false;
    }
    await clearDiscordVoice(ctx, row.game_id);
    await ctx.db.patch(row._id, { state: 'deleting' });
    return true;
  },
});

export const removed = internalMutation({
  args: claimArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (row?.lease === args.lease) {
      await clearDiscordVoice(ctx, row.game_id);
      await ctx.db.patch(row._id, {
        state: 'deleted',
        deleted_at: Date.now(),
        invite_url: undefined,
        error: undefined,
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
    const game = await ctx.db.get(row.game_id);
    /* Finished rooms are checked by the hourly snapshot, not the provisioning retry cron. */
    let next = game?.directory?.stage === 'finished' ? Number.MAX_SAFE_INTEGER : row.cleanup_at;
    const changed = (row.work_revision ?? 0) !== (row.lease_revision ?? 0);
    if (changed && row.state !== 'creating') {
      /* A failed old invite or rename must not postpone a newly discarded game, except for Discord's rate limit. */
      next = Math.max(Date.now(), row.retry_after ?? 0, Date.now() + (args.retryAfterMs ?? 0));
    } else if (args.error || row.state === 'creating') {
      next = Date.now() + Math.max(DISCORD_RETRY, args.retryAfterMs ?? 0);
    } else if (row.state === 'pending') {
      next = Math.max(Date.now(), row.retry_after ?? 0);
    }
    await ctx.db.patch(row._id, {
      lease: undefined,
      lease_until: undefined,
      lease_revision: undefined,
      next_attempt_at: next,
      retry_after: args.retryAfterMs ? Date.now() + args.retryAfterMs : row.retry_after,
      error: row.state === 'creating' ? row.error : args.error,
    });
    if (row.state !== 'deleted' && row.state !== 'creating' && (changed || next <= Date.now())) {
      await ctx.scheduler.runAfter(Math.max(0, next - Date.now()), internal.playDiscordActions.reconcile, {
        channelId: row._id,
      });
    }
    return null;
  },
});

/** Indexed batches advance due rows before scheduling, so one failing room cannot hold up later cleanup. */
export const retryDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (!(await discordEnabled(ctx))) {
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
