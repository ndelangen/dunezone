import { zodToConvex } from 'convex-helpers/server/zod4';
import { paginationOptsValidator } from 'convex/server';
import type { PaginationOptions } from 'convex/server';
import { v } from 'convex/values';

import {
  PLAY_FIXTURE_KEY,
  playAccountDeletionRequestSchema,
  playRetireFixtureRequestSchema,
} from '../src/shared/play/admission';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { internalMutation } from './functions';
import { postPlayService } from './lib/playService';

async function queueGameDeletion(
  ctx: MutationCtx,
  routing: Doc<'play_game_accounts'>,
  operation: Doc<'account_deletion_operations'>
) {
  await ctx.db.patch(routing._id, { deletion_operation_id: operation._id });
  const previous = await ctx.db
    .query('play_account_deletions')
    .withIndex('by_game_id_operation_id', (q) => q.eq('game_id', routing.game_id).eq('operation_id', operation._id))
    .unique();
  if (previous) {
    return;
  }
  const eventId = await ctx.db.insert('play_account_deletions', {
    game_id: routing.game_id,
    user_id: operation.source_user_id,
    operation_id: operation._id,
    state: 'pending',
    attempts: 0,
    next_attempt_at: Date.now(),
    created_at: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.playDeletion.deliver, { eventId });
}

async function queueDeletionPage(
  ctx: MutationCtx,
  args: { operationId: Id<'account_deletion_operations'>; paginationOpts: PaginationOptions }
) {
  const operation = await ctx.db.get(args.operationId);
  if (!operation) {
    return;
  }
  const page = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_user_id', (q) => q.eq('user_id', operation.source_user_id))
    .paginate({ ...args.paginationOpts, numItems: 32 });
  for (const routing of page.page) {
    await queueGameDeletion(ctx, routing, operation);
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.playDeletion.queueAccountDeletion, {
      operationId: operation._id,
      paginationOpts: { cursor: page.continueCursor, numItems: 32 },
    });
  }
}

function isDueDeletion(event: Doc<'play_account_deletions'>) {
  return event.state === 'pending' && Date.now() >= event.next_attempt_at;
}

/** Account deletion closes admission before this bounded fan-out starts, so routing cannot grow behind the cursor. */
export const queueAccountDeletion = internalMutation({
  args: { operationId: v.id('account_deletion_operations'), paginationOpts: paginationOptsValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    await queueDeletionPage(ctx, args);
    return null;
  },
});

/** Claiming a delivery also persists its next retry, before any external request can fail. */
export const claimDelivery = internalMutation({
  args: { eventId: v.id('play_account_deletions') },
  returns: zodToConvex(playAccountDeletionRequestSchema.nullable()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || !isDueDeletion(event)) {
      return null;
    }
    const game = await ctx.db.get(event.game_id);
    if (game?.state !== 'ready') {
      return null;
    }
    const delay = Math.min(300_000, 1000 * 2 ** Math.min(event.attempts, 9));
    const nextAttemptAt = Date.now() + delay;
    await ctx.db.patch(event._id, { attempts: event.attempts + 1, next_attempt_at: nextAttemptAt });
    await ctx.scheduler.runAt(nextAttemptAt, internal.playDeletion.deliver, { eventId: event._id });
    return {
      gameId: game._id,
      secret: game.secret,
      eventId: event._id,
      userId: event.user_id,
      deletionOperationId: event.operation_id,
    };
  },
});

export const deliver = internalAction({
  args: { eventId: v.id('play_account_deletions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runMutation(internal.playDeletion.claimDelivery, args);
    if (delivery) {
      try {
        await postPlayService(delivery.gameId, 'account-deletion', playAccountDeletionRequestSchema.parse(delivery));
      } catch {
        // Only the authenticated acknowledgement retires this event. The retry is already durable.
      }
    }
    return null;
  },
});

/** Repairs an action failure that happened before its claim transaction could schedule a retry. */
export const retryDueDeletions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const due = await ctx.db
      .query('play_account_deletions')
      .withIndex('by_state_next_attempt_at', (q) => q.eq('state', 'pending').lte('next_attempt_at', Date.now()))
      .take(32);
    for (const event of due) {
      await ctx.scheduler.runAfter(0, internal.playDeletion.deliver, { eventId: event._id });
    }
    return null;
  },
});

/* Doubling from one second, a retirement keeps trying for about a day, well past a Worker release that ships after the backend. */
const RETIRE_ATTEMPTS = 17;

/**
 * Closes the hosted fixture for good (#1535): no player has opened it since admission stopped (#1505), and a room holding a request from before requests named their seat (#1172) no longer loads (#1407), so deletions routed to it could never be acknowledged.
 * Its pending deletions settle here, its routing goes so none are queued again, and the room is asked to delete everything it stored, the deleted accounts' names included.
 */
export async function retireHostedFixture(ctx: MutationCtx, game: Doc<'play_games'>) {
  if (game.fixture_key !== PLAY_FIXTURE_KEY || game.state !== 'ready') {
    return;
  }
  await ctx.db.patch(game._id, { state: 'expired' });
  const events = ctx.db
    .query('play_account_deletions')
    .withIndex('by_game_id_operation_id', (q) => q.eq('game_id', game._id));
  for await (const event of events) {
    if (event.state === 'pending') {
      await ctx.db.patch(event._id, { state: 'acknowledged' });
    }
  }
  const routings = ctx.db.query('play_game_accounts').withIndex('by_game_id_user_id', (q) => q.eq('game_id', game._id));
  for await (const routing of routings) {
    await ctx.db.delete(routing._id);
  }
  await ctx.scheduler.runAfter(0, internal.playDeletion.retireFixtureRoom, { gameId: game._id, attempt: 0 });
}

export const retiredFixture = internalQuery({
  args: { gameId: v.id('play_games') },
  returns: v.union(v.object({ gameId: v.id('play_games'), secret: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    return game?.fixture_key === PLAY_FIXTURE_KEY && game.state === 'expired'
      ? { gameId: game._id, secret: game.secret }
      : null;
  },
});

export const retireFixtureRoom = internalAction({
  args: { gameId: v.id('play_games'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const credentials = await ctx.runQuery(internal.playDeletion.retiredFixture, { gameId: args.gameId });
    if (!credentials) {
      return null;
    }
    let retired = false;
    try {
      retired = await postPlayService(args.gameId, 'retire', playRetireFixtureRequestSchema.parse(credentials));
    } catch {
      /* A lost request is retried below like a refused one. */
    }
    if (retired) {
      return null;
    }
    if (args.attempt + 1 >= RETIRE_ATTEMPTS) {
      console.error(`The hosted fixture room ${args.gameId} did not retire after ${RETIRE_ATTEMPTS} attempts.`);
      return null;
    }
    await ctx.scheduler.runAfter(1000 * 2 ** args.attempt, internal.playDeletion.retireFixtureRoom, {
      gameId: args.gameId,
      attempt: args.attempt + 1,
    });
    return null;
  },
});
