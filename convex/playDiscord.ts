import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalQuery } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { internalMutation } from './functions';
import { accountStateOf } from './lib/accountLifecycle';
import { docValidator } from './lib/collaborativeAccessValidators';
import { discordRetryOperation, retryCreationCategory } from './lib/discordRetry';
import { discordEnabled } from './lib/discordStatus';
import { playCredential } from './lib/playAuthorization';
import { DISCORD_BATCH, DISCORD_LEASE, DISCORD_RETRY, markDiscordDeleted } from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';

const channelValidator = docValidator('play_game_discord_channels');
const reconcileArgs = { channelId: v.id('play_game_discord_channels') };
const claimArgs = { ...reconcileArgs, lease: v.string() };

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
  args: reconcileArgs,
  returns: v.union(v.null(), channelValidator),
  handler: async (ctx, { channelId }) => {
    const row = await ctx.db.get(channelId);
    if (!(await discordEnabled(ctx)) || !row || row.state === 'deleted' || (row.lease_until ?? 0) > Date.now()) {
      return null;
    }
    /* New lifecycle work can supersede application backoff, but never Discord's hard cooldown. */
    const sameWork = row.retry?.revision === (row.work_revision ?? 0);
    const notBefore = Math.max(row.retry_after ?? 0, sameWork ? (row.retry?.until ?? 0) : 0);
    if (notBefore > Date.now() && !retiresWithoutChannel(row, await ctx.db.get(row.game_id))) {
      return null;
    }
    const cooldown = await ctx.db.query('play_discord_cooldown').unique();
    if (cooldown && cooldown.blocked_until > Date.now()) {
      await ctx.db.patch(row._id, { next_attempt_at: cooldown.blocked_until, retry_after: cooldown.blocked_until });
      await ctx.scheduler.runAt(cooldown.blocked_until, internal.playDiscordActions.reconcile, {
        channelId,
      });
      return null;
    }
    const lease = playCredential();
    const until = Date.now() + DISCORD_LEASE;
    const retry = sameWork && row.retry?.kind === 'short' ? row.retry : undefined;
    await ctx.db.patch(row._id, {
      lease,
      lease_until: until,
      lease_revision: row.work_revision ?? 0,
      next_attempt_at: until,
      retry_after: undefined,
      retry,
    });
    return { ...row, lease, lease_until: until, next_attempt_at: until, retry_after: undefined, retry };
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

function retiresWithoutChannel(channel: Doc<'play_game_discord_channels'>, game: Doc<'play_games'> | null) {
  return !channel.channel_id && channel.state !== 'creating' && retirementDue(channel, game);
}

async function retirementRequired(
  ctx: QueryCtx,
  row: Doc<'play_game_discord_channels'>,
  game: Doc<'play_games'> | null
) {
  if (retirementDue(row, game)) {
    return true;
  }
  return game?.creator_id ? (await ctx.db.get(game.creator_id))?.account_state === 'banned' : false;
}

async function creationNeeded(ctx: QueryCtx, row: Doc<'play_game_discord_channels'>) {
  const game = await ctx.db.get(row.game_id);
  if (retirementDue(row, game) || game?.directory?.stage === 'finished' || game?.discord_voice !== true) {
    return false;
  }
  const creator = game.creator_id ? await ctx.db.get(game.creator_id) : null;
  return !!creator && accountStateOf(creator) === 'active';
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
    const remove = await retirementRequired(ctx, channel, game);
    /* Avoid category requests while creation is exhausted; startCreation still spends quota atomically before POST. */
    if (!remove && channel.state === 'pending' && !channel.channel_id && !retryCreationCategory(channel)) {
      const quota = await playRateLimiter.check(ctx, 'discordChannelCreateGlobal');
      if (!quota.ok) {
        await ctx.db.patch(channel._id, {
          retry_after: Date.now() + Math.max(1, quota.retryAfter ?? DISCORD_RETRY),
        });
        return null;
      }
    }
    return {
      channel,
      name: ended ? `${name.slice(0, 92)} (ended)` : name.slice(0, 100),
      ended,
      remove,
    };
  },
});

/** Persist before POST: a process that dies after Discord accepts the request must never blindly repeat it. */
export const startCreation = internalMutation({
  args: { ...claimArgs, categoryId: v.optional(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !(await discordEnabled(ctx)) ||
      row?.lease !== args.lease ||
      (row.lease_until ?? 0) <= Date.now() ||
      row.state !== 'pending' ||
      row.channel_id !== undefined ||
      (args.categoryId !== undefined && !row.category_ids.includes(args.categoryId))
    ) {
      return false;
    }
    if (!(await creationNeeded(ctx, row))) {
      await ctx.db.patch(row._id, { retry_after: Date.now() + DISCORD_RETRY });
      return false;
    }
    const retryCategory = retryCreationCategory(row);
    if (!retryCategory || retryCategory !== args.categoryId) {
      const quota = await playRateLimiter.limit(ctx, 'discordChannelCreateGlobal');
      if (!quota.ok) {
        await ctx.db.patch(row._id, { retry_after: Date.now() + Math.max(1, quota.retryAfter ?? DISCORD_RETRY) });
        return false;
      }
    }
    await ctx.db.patch(row._id, {
      state: 'creating',
      ...(args.categoryId
        ? {
            creation_marker: row.creation_marker ?? `dune-play-${row.game_id}`,
            creation_category_id: args.categoryId,
            creation_name_pending: true,
            creation_attempt: (row.creation_attempt ?? 0) + 1,
          }
        : {}),
      error: 'Channel creation has no confirmed result. Recovery will check Discord before trying again.',
    });
    return true;
  },
});

/** A successful visible listing authorizes one replacement; adoption saves its ID through created instead. */
export const replaceMissingCreation = internalMutation({
  args: { ...claimArgs, marker: v.string(), categoryId: v.string(), attempt: v.number() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !(await discordEnabled(ctx)) ||
      row?.lease !== args.lease ||
      (row.lease_until ?? 0) <= Date.now() ||
      row.state !== 'creating' ||
      row.channel_id ||
      row.creation_marker !== args.marker ||
      row.creation_category_id !== args.categoryId ||
      (row.creation_attempt ?? 0) !== args.attempt
    ) {
      return false;
    }
    if (!(await creationNeeded(ctx, row))) {
      const game = await ctx.db.get(row.game_id);
      if ((await retirementRequired(ctx, row, game)) || game?.directory?.stage === 'finished') {
        await markDiscordDeleted(ctx, row);
      } else {
        await ctx.db.patch(row._id, { retry_after: Date.now() + DISCORD_RETRY });
      }
      return false;
    }
    const quota = await playRateLimiter.limit(ctx, 'discordChannelCreateGlobal');
    if (!quota.ok) {
      await ctx.db.patch(row._id, {
        retry: {
          kind: 'backoff',
          revision: row.work_revision ?? 0,
          until: Date.now() + Math.max(1, quota.retryAfter ?? DISCORD_RETRY),
        },
      });
      return false;
    }
    /* An ambiguous POST never inherits the definitely-rejected short-retry reservation. */
    await ctx.db.patch(row._id, {
      retry: undefined,
      creation_name_pending: true,
      creation_attempt: args.attempt + 1,
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
      (await retirementRequired(ctx, row, await ctx.db.get(row.game_id)))
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
      await ctx.db.patch(row._id, { renamed_ended: args.ended, creation_name_pending: undefined });
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
    if (!(await retirementRequired(ctx, row, await ctx.db.get(row.game_id)))) {
      return false;
    }
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
      await markDiscordDeleted(ctx, row);
    }
    return null;
  },
});

const releaseArgs = v.object({
  ...claimArgs,
  error: v.optional(v.string()),
  retryAfterMs: v.optional(v.number()),
  retryAt: v.optional(v.number()),
  retryGlobal: v.optional(v.boolean()),
  retryOperation: v.optional(discordRetryOperation),
  retryCategoryId: v.optional(v.string()),
});
type ReleaseArgs = Infer<typeof releaseArgs>;

function matchingShortRetryAttempts(row: Doc<'play_game_discord_channels'>, args: ReleaseArgs) {
  const retry = row.retry?.kind === 'short' ? row.retry : undefined;
  return retry?.revision === (row.work_revision ?? 0) &&
    retry.operation === args.retryOperation &&
    retry.categoryId === args.retryCategoryId
    ? retry.attempts
    : 0;
}

function releaseHistory(row: Doc<'play_game_discord_channels'>, args: ReleaseArgs) {
  const changed = (row.work_revision ?? 0) !== (row.lease_revision ?? 0);
  const backoff =
    row.retry?.kind === 'backoff' && row.retry.revision === (row.work_revision ?? 0) ? row.retry : undefined;
  const attempts = matchingShortRetryAttempts(row, args);
  const shortRetry =
    !changed &&
    row.state !== 'creating' &&
    args.retryOperation !== undefined &&
    (args.retryAfterMs ?? 0) > 0 &&
    args.retryAfterMs! <= 5000 &&
    attempts < 2;
  return { changed, backoff, attempts, shortRetry };
}

function nextAttemptForRelease(
  row: Doc<'play_game_discord_channels'>,
  game: Doc<'play_games'> | null,
  args: ReleaseArgs,
  history: ReturnType<typeof releaseHistory>,
  timing: { retryAt: number; retryAfter: number | undefined; hardUntil: number }
) {
  if (history.changed && row.state !== 'creating') {
    /* A failed old invite or rename must not postpone a newly discarded game, except for Discord's rate limit. */
    return Math.max(Date.now(), timing.hardUntil);
  }
  if (history.shortRetry) {
    return Math.max(Date.now(), timing.retryAt);
  }
  if (args.error || row.state === 'creating') {
    return Math.max(Date.now() + DISCORD_RETRY, timing.retryAt, timing.retryAfter ?? 0, history.backoff?.until ?? 0);
  }
  if (row.state === 'pending') {
    return Math.max(Date.now(), timing.retryAfter ?? 0);
  }
  /* Finished rooms are checked by the hourly snapshot, not the provisioning retry cron. */
  return game?.directory?.stage === 'finished' ? Number.MAX_SAFE_INTEGER : row.cleanup_at;
}

function retryForRelease(
  row: Doc<'play_game_discord_channels'>,
  args: ReleaseArgs,
  history: ReturnType<typeof releaseHistory>,
  next: number
): Doc<'play_game_discord_channels'>['retry'] {
  if (history.shortRetry) {
    return {
      kind: 'short',
      operation: args.retryOperation!,
      attempts: history.attempts === 0 ? 1 : 2,
      categoryId: args.retryCategoryId,
      revision: row.work_revision ?? 0,
      until: next,
    };
  }
  if (!history.changed && history.attempts >= 2 && (args.retryAfterMs ?? 0) > 0 && args.retryAfterMs! <= 5000) {
    return { kind: 'backoff', revision: row.work_revision ?? 0, until: next };
  }
  if (history.backoff && history.backoff.until > Date.now()) {
    return history.backoff;
  }
  return undefined;
}

export const release = internalMutation({
  args: releaseArgs.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (!row || row.lease !== args.lease) {
      return null;
    }
    if (row.state === 'deleted') {
      await ctx.db.patch(row._id, {
        lease: undefined,
        lease_until: undefined,
        lease_revision: undefined,
        retry_after: undefined,
        retry: undefined,
        error: undefined,
      });
      return null;
    }
    const game = await ctx.db.get(row.game_id);
    const retryAfter = retiresWithoutChannel(row, game) ? undefined : row.retry_after;
    const history = releaseHistory(row, args);
    const retryAt = args.retryAt ?? Date.now() + (args.retryAfterMs ?? 0);
    const globalUntil = args.retryGlobal
      ? ((await ctx.db.query('play_discord_cooldown').unique())?.blocked_until ?? 0)
      : 0;
    const hardUntil = Math.max(retryAfter ?? 0, globalUntil);
    const next = nextAttemptForRelease(row, game, args, history, { retryAt, retryAfter, hardUntil });
    await ctx.db.patch(row._id, {
      lease: undefined,
      lease_until: undefined,
      lease_revision: undefined,
      next_attempt_at: next,
      retry_after: hardUntil > Date.now() ? hardUntil : undefined,
      retry: retryForRelease(row, args, history, next),
      error: args.error ?? (row.state === 'creating' ? row.error : undefined),
    });
    if (history.changed || row.state === 'creating' || next <= Date.now() || (args.retryAfterMs ?? 0) > 0) {
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
    let moreDue = false;
    for (const state of ['pending', 'creating', 'ready', 'deleting'] as const) {
      const due: Doc<'play_game_discord_channels'>[] = await ctx.db
        .query('play_game_discord_channels')
        .withIndex('by_state_next_attempt_at', (q) => q.eq('state', state).lte('next_attempt_at', Date.now()))
        .take(DISCORD_BATCH);
      for (const row of due) {
        await ctx.db.patch(row._id, { next_attempt_at: Date.now() + DISCORD_RETRY });
        await ctx.scheduler.runAfter(0, internal.playDiscordActions.reconcile, { channelId: row._id });
      }
      if (due.length === DISCORD_BATCH) {
        moreDue = true;
      }
    }
    if (moreDue) {
      await ctx.scheduler.runAfter(0, internal.playDiscord.retryDue, {});
    }
    return null;
  },
});
