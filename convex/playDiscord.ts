import { v } from 'convex/values';
import type { Infer } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation } from './functions';
import { accountStateOf } from './lib/accountLifecycle';
import { docValidator } from './lib/collaborativeAccessValidators';
import {
  DISCORD_ATTEMPTS,
  DISCORD_PARKED,
  discordLifecycleOperation,
  discordNeedsAttention,
  discordRetryOperation,
  retryCreationCategory,
} from './lib/discordRetry';
import { discordEnabled } from './lib/discordStatus';
import { playCredential } from './lib/playAuthorization';
import { clearDiscordVoice, DISCORD_BATCH, DISCORD_LEASE, DISCORD_RETRY, markDiscordDeleted } from './lib/playDiscord';
import { playRateLimiter } from './lib/playRateLimits';

const channelValidator = docValidator('play_game_discord_channels');
const reconcileArgs = { channelId: v.id('play_game_discord_channels') };
const claimArgs = { ...reconcileArgs, lease: v.string() };

type LifecycleOperation = Infer<typeof discordLifecycleOperation>;

function parkedDeadline(
  row: Doc<'play_game_discord_channels'>,
  game: Doc<'play_games'> | null,
  operation: LifecycleOperation
) {
  if (
    operation === 'delete' ||
    row.state === 'creating' ||
    game?.directory?.stage === 'finished' ||
    game?.directory?.stage === 'discarded'
  ) {
    return DISCORD_PARKED;
  }
  return row.cleanup_at > Date.now() ? row.cleanup_at : DISCORD_PARKED;
}

async function parkChannel(
  ctx: MutationCtx,
  row: Doc<'play_game_discord_channels'>,
  game: Doc<'play_games'> | null,
  operation: LifecycleOperation,
  attempts: 1 | 2 | 3,
  error = row.error ?? 'Discord channel work needs attention after three attempts.'
) {
  const previousUntil = row.retry?.revision === (row.work_revision ?? 0) ? (row.retry.until ?? 0) : 0;
  const until = Math.max(previousUntil, row.retry_after ?? 0);
  await ctx.db.patch(row._id, {
    lease: undefined,
    lease_until: undefined,
    lease_revision: undefined,
    retry: {
      kind: 'bounded',
      operation,
      revision: row.work_revision ?? 0,
      attempts,
      needsAttention: true,
      until: until > Date.now() && until < DISCORD_PARKED ? until : undefined,
    },
    next_attempt_at: parkedDeadline(row, game, operation),
    error,
  });
}

function operationForWork(
  channel: Doc<'play_game_discord_channels'>,
  game: Doc<'play_games'> | null,
  remove: boolean
): LifecycleOperation | null {
  if (channel.state === 'creating') {
    return 'provision';
  }
  if (remove) {
    return 'delete';
  }
  if (channel.state === 'pending') {
    return 'provision';
  }
  if (channel.channel_id && !!channel.renamed_ended !== (game?.directory?.stage === 'finished')) {
    return game?.directory?.stage === 'finished' ? 'rename-ended' : 'rename-active';
  }
  return null;
}

function priorAttempts(row: Doc<'play_game_discord_channels'>, operation: LifecycleOperation) {
  const retry = row.retry;
  if (retry?.revision !== (row.work_revision ?? 0)) {
    return 0;
  }
  return retry.operation === operation ? retry.attempts : 0;
}

function inactivityRetiresParked(row: Doc<'play_game_discord_channels'>, game: Doc<'play_games'> | null) {
  return (
    row.retry?.kind === 'bounded' &&
    row.retry.operation !== 'delete' &&
    row.state !== 'creating' &&
    game?.state === 'ready' &&
    game.directory?.stage !== 'finished' &&
    game.directory?.stage !== 'discarded' &&
    row.cleanup_at <= Date.now()
  );
}

export const claim = internalMutation({
  args: reconcileArgs,
  returns: v.union(v.null(), channelValidator),
  handler: async (ctx, { channelId }) => {
    let row = await ctx.db.get(channelId);
    if (!row || row.state === 'deleted' || (row.lease_until ?? 0) > Date.now()) {
      return null;
    }
    if (discordNeedsAttention(row) && row.retry?.kind === 'bounded' && row.retry.operation === 'delete') {
      return null;
    }
    const game = await ctx.db.get(row.game_id);
    const parked = discordNeedsAttention(row);
    if (parked && !inactivityRetiresParked(row, game)) {
      return null;
    }
    if (!(await discordEnabled(ctx))) {
      return null;
    }
    if (parked) {
      const freshWork = {
        work_revision: (row.work_revision ?? 0) + 1,
        retry: undefined,
        error: undefined,
        deletion_requested_at: Date.now(),
        state: row.state === 'creating' ? ('creating' as const) : ('deleting' as const),
      };
      await ctx.db.patch(row._id, freshWork);
      row = { ...row, ...freshWork };
    }
    if (retiresWithoutChannel(row, game)) {
      await markDiscordDeleted(ctx, row);
      return null;
    }
    const operation = operationForWork(row, game, retirementDue(row, game));
    if (!operation) {
      await ctx.db.patch(row._id, {
        retry: undefined,
        next_attempt_at: game?.directory?.stage === 'finished' ? DISCORD_PARKED : row.cleanup_at,
      });
      return null;
    }
    const attempts = priorAttempts(row, operation);
    if (attempts >= DISCORD_ATTEMPTS) {
      await parkChannel(ctx, row, game, operation, 3);
      return null;
    }
    const sameWork = row.retry?.revision === (row.work_revision ?? 0);
    const notBefore = Math.max(row.retry_after ?? 0, sameWork ? (row.retry?.until ?? 0) : 0);
    if (notBefore > Date.now()) {
      return null;
    }
    const cooldown = await ctx.db.query('play_discord_cooldown').unique();
    if (cooldown && cooldown.blocked_until > Date.now()) {
      await ctx.db.patch(row._id, { next_attempt_at: cooldown.blocked_until, retry_after: cooldown.blocked_until });
      await ctx.scheduler.runAt(cooldown.blocked_until, internal.playDiscordActions.reconcile, { channelId });
      return null;
    }
    const lease = playCredential();
    const until = Date.now() + DISCORD_LEASE;
    const retry: Extract<NonNullable<Doc<'play_game_discord_channels'>['retry']>, { kind: 'bounded' }> = {
      kind: 'bounded',
      operation,
      revision: row.work_revision ?? 0,
      attempts: (attempts + 1) as 1 | 2 | 3,
      needsAttention: false,
    };
    const patch = {
      lease,
      lease_until: until,
      lease_revision: row.work_revision ?? 0,
      next_attempt_at: until,
      retry_after: undefined,
      retry,
    };
    await ctx.db.patch(row._id, patch);
    return { ...row, ...patch };
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
    if (
      !(await discordEnabled(ctx)) ||
      !channel ||
      channel.lease !== args.lease ||
      channel.state === 'deleted' ||
      discordNeedsAttention(channel) ||
      (channel.work_revision ?? 0) !== (channel.lease_revision ?? 0)
    ) {
      return null;
    }
    const game = await ctx.db.get(channel.game_id);
    const ended = game?.directory?.stage === 'finished';
    const name = game?.name ?? 'Dune Play';
    const remove = retirementDue(channel, game);
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
  args: { ...claimArgs, categoryId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.channelId);
    if (
      !(await discordEnabled(ctx)) ||
      row?.lease !== args.lease ||
      (row.lease_until ?? 0) <= Date.now() ||
      (row.work_revision ?? 0) !== (row.lease_revision ?? 0) ||
      row.state !== 'pending' ||
      row.channel_id !== undefined ||
      !row.category_ids.includes(args.categoryId)
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
      creation_marker: `dune-play-${row.game_id}`,
      creation_category_id: args.categoryId,
      creation_name_pending: true,
      creation_attempt: (row.creation_attempt ?? 0) + 1,
      error: 'Channel creation has no confirmed result. Recovery will check Discord before trying again.',
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
  attempted: v.optional(v.boolean()),
  needsAttention: v.optional(v.boolean()),
  operation: v.optional(discordLifecycleOperation),
  paused: v.optional(v.boolean()),
});

type BoundedRetry = Extract<NonNullable<Doc<'play_game_discord_channels'>['retry']>, { kind: 'bounded' }>;
const releasedLease = { lease: undefined, lease_until: undefined, lease_revision: undefined };

function retryBudget(row: Doc<'play_game_discord_channels'>, operation: LifecycleOperation): BoundedRetry {
  if (row.retry?.kind === 'bounded' && row.retry.revision === (row.work_revision ?? 0)) {
    return row.retry;
  }
  return { kind: 'bounded', operation, revision: row.work_revision ?? 0, attempts: 1, needsAttention: false };
}

function releasedOperation(
  operation: LifecycleOperation | undefined,
  request: Infer<typeof discordRetryOperation> | undefined
) {
  if (operation || !request) {
    return operation;
  }
  if (request === 'rename-ended' || request === 'rename-active' || request === 'delete') {
    return request;
  }
  return 'provision';
}

async function queueReleasedWork(
  ctx: MutationCtx,
  row: Doc<'play_game_discord_channels'>,
  next: number,
  retry: Doc<'play_game_discord_channels'>['retry'],
  hardUntil: number,
  error: string | undefined
) {
  await ctx.db.patch(row._id, {
    ...releasedLease,
    next_attempt_at: next,
    retry,
    retry_after: hardUntil > Date.now() ? hardUntil : undefined,
    error,
  });
  await ctx.scheduler.runAt(next, internal.playDiscordActions.reconcile, { channelId: row._id });
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
      await ctx.db.patch(row._id, { ...releasedLease, retry_after: undefined, retry: undefined, error: undefined });
      return null;
    }
    const game = await ctx.db.get(row.game_id);
    const changed = (row.work_revision ?? 0) !== (row.lease_revision ?? 0);
    const globalUntil = args.retryGlobal
      ? ((await ctx.db.query('play_discord_cooldown').unique())?.blocked_until ?? 0)
      : 0;
    const providerUntil = (args.retryAfterMs ?? 0) > 0 ? (args.retryAt ?? Date.now() + args.retryAfterMs!) : 0;
    const remaining = operationForWork(row, game, retirementDue(row, game));
    const previousOperation = releasedOperation(args.operation, args.retryOperation);
    const sameOperation = previousOperation === undefined || previousOperation === remaining;
    const heldUntil = Math.max(row.retry_after ?? 0, globalUntil, changed && sameOperation ? providerUntil : 0);
    if (changed) {
      if (discordNeedsAttention(row)) {
        await ctx.db.patch(row._id, releasedLease);
        return null;
      }
      const retry = row.retry?.revision === (row.work_revision ?? 0) ? row.retry : undefined;
      await queueReleasedWork(ctx, row, Math.max(Date.now(), heldUntil), retry, heldUntil, row.error);
      return null;
    }
    if (!remaining) {
      await ctx.db.patch(row._id, {
        ...releasedLease,
        retry: undefined,
        retry_after: undefined,
        error: undefined,
        next_attempt_at: game?.directory?.stage === 'finished' ? DISCORD_PARKED : row.cleanup_at,
      });
      return null;
    }
    const budget = retryBudget(row, remaining);
    if (remaining !== budget.operation) {
      await queueReleasedWork(ctx, row, Math.max(Date.now(), heldUntil), undefined, heldUntil, undefined);
      return null;
    }
    const hardUntil = Math.max(heldUntil, providerUntil);
    const waitForFailure = args.error && !args.paused && (args.retryAfterMs ?? 0) <= 0;
    const next = Math.max(waitForFailure ? Date.now() + DISCORD_RETRY : Date.now(), hardUntil);
    if (args.attempted === false && !args.needsAttention) {
      const retry: BoundedRetry | undefined =
        budget.attempts > 1
          ? { ...budget, attempts: (budget.attempts - 1) as 1 | 2, until: next, needsAttention: false }
          : undefined;
      await queueReleasedWork(ctx, row, next, retry, hardUntil, args.error ?? row.error);
      return null;
    }
    if (args.needsAttention || budget.attempts >= DISCORD_ATTEMPTS || discordNeedsAttention(row)) {
      await ctx.db.patch(row._id, { ...releasedLease, retry_after: hardUntil > Date.now() ? hardUntil : undefined });
      await parkChannel(
        ctx,
        { ...row, retry_after: hardUntil },
        game,
        remaining,
        budget.attempts,
        args.error ?? row.error
      );
      return null;
    }
    await queueReleasedWork(
      ctx,
      row,
      next,
      { ...budget, until: next, needsAttention: false },
      hardUntil,
      args.error ?? row.error
    );
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
        if (discordNeedsAttention(row) && !inactivityRetiresParked(row, await ctx.db.get(row.game_id))) {
          await ctx.db.patch(row._id, { next_attempt_at: DISCORD_PARKED });
          continue;
        }
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
