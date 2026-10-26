import { zodToConvex } from 'convex-helpers/server/zod4';
import { paginationOptsValidator } from 'convex/server';
import type { PaginationOptions } from 'convex/server';
import { v } from 'convex/values';

import { PLAY_FIXTURE_KEY, playAccountDeletionRequestSchema } from '../src/shared/play/admission';
import { playRetireFixtureRequestSchema } from '../src/shared/play/retire';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalAction, internalQuery } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation } from './functions';
import { gameActorForAccount } from './lib/accountIdentity';
import { enrolment } from './lib/playSeatPass';
import { postPlayService } from './lib/playService';

async function queueGameDeletion(
  ctx: MutationCtx,
  routing: Doc<'play_game_accounts'>,
  operation: Doc<'account_deletion_operations'>
) {
  await ctx.db.patch(routing._id, { deletion_operation_id: operation._id });
  for (const actorId of routing.actor_user_ids ?? [routing.user_id]) {
    const previous = await ctx.db
      .query('play_account_deletions')
      .withIndex('by_game_operation_user', (q) =>
        q.eq('game_id', routing.game_id).eq('operation_id', operation._id).eq('user_id', actorId)
      )
      .unique();
    if (previous) {
      continue;
    }
    const eventId = await ctx.db.insert('play_account_deletions', {
      game_id: routing.game_id,
      user_id: actorId,
      operation_id: operation._id,
      state: 'pending',
      attempts: 0,
      next_attempt_at: Date.now(),
      created_at: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.playDeletion.deliver, { eventId });
  }
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
    return;
  }
  await ctx.scheduler.runAfter(0, internal.playDeletion.queueCreatorDeletion, {
    operationId: operation._id,
    cursor: null,
  });
}

/*
 * Games created before creators were enrolled at creation can seat a creator with no routing row, which rooms used to find only by reconciling.
 * Seat-pass rooms no longer reconcile, so the fan-out enrols each such creator and queues the deletion through that row like any other.
 */
export const queueCreatorDeletion = internalMutation({
  args: { operationId: v.id('account_deletion_operations'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) {
      return null;
    }
    const page = await ctx.db
      .query('play_games')
      .withIndex('by_creator_id', (q) => q.eq('creator_id', operation.source_user_id))
      .paginate({ cursor: args.cursor, numItems: 32 });
    for (const game of page.page) {
      if (game.state !== 'ready' || (await enrolment(ctx, game._id, operation.source_user_id))) {
        continue;
      }
      const routingId = await ctx.db.insert('play_game_accounts', {
        game_id: game._id,
        user_id: operation.source_user_id,
        actor_user_ids: [await gameActorForAccount(ctx, game._id, operation.source_user_id)],
      });
      await queueGameDeletion(ctx, (await ctx.db.get(routingId))!, operation);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.playDeletion.queueCreatorDeletion, {
        operationId: operation._id,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/*
 * Rooms once found a creator deleted before `queueCreatorDeletion` existed by reconciling their accounts, which seat-pass rooms no longer do.
 * This walks every completed deletion and runs the creator fan-out for it again; the fan-out skips a game whose creator is already routed,
 * so a second run, or a run with no such creator anywhere, queues nothing.
 */
export const requeueCreatorDeletions = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('account_deletion_operations').paginate({ cursor: args.cursor, numItems: 64 });
    for (const operation of page.page) {
      if (operation.state === 'completed') {
        await ctx.scheduler.runAfter(0, internal.playDeletion.queueCreatorDeletion, {
          operationId: operation._id,
          cursor: null,
        });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.playDeletion.requeueCreatorDeletions, { cursor: page.continueCursor });
    }
    return null;
  },
});

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
  returns: v.union(
    v.object({ operation: v.literal('account-deletion'), request: zodToConvex(playAccountDeletionRequestSchema) }),
    v.object({ operation: v.literal('retire'), request: zodToConvex(playRetireFixtureRequestSchema) }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || !isDueDeletion(event)) {
      return null;
    }
    const delay = Math.min(300_000, 1000 * 2 ** Math.min(event.attempts, 9));
    const nextAttemptAt = Date.now() + delay;
    await ctx.db.patch(event._id, { attempts: event.attempts + 1, next_attempt_at: nextAttemptAt });
    /* A game that is not ready waits out the same backoff, so its events never crowd the due index. */
    const game = await ctx.db.get(event.game_id);
    if (!game) {
      await ctx.db.patch(event._id, { state: 'acknowledged' });
      return null;
    }
    /*
     * A game that never opened can still have a room that stored the creator before its confirmation failed past the deadline.
     * Such a room is never confirmed now, so it is asked to delete everything; the deletion is done once it answers, empty or emptied.
     */
    if (isUnopened(game)) {
      await ctx.scheduler.runAt(nextAttemptAt, internal.playDeletion.deliver, { eventId: event._id });
      return { operation: 'retire' as const, request: { gameId: game._id, secret: game.secret } };
    }
    if (game.state !== 'ready') {
      return null;
    }
    await ctx.scheduler.runAt(nextAttemptAt, internal.playDeletion.deliver, { eventId: event._id });
    return {
      operation: 'account-deletion' as const,
      request: {
        gameId: game._id,
        secret: game.secret,
        eventId: event._id,
        userId: event.user_id,
        deletionOperationId: event.operation_id,
      },
    };
  },
});

export const deliver = internalAction({
  args: { eventId: v.id('play_account_deletions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runMutation(internal.playDeletion.claimDelivery, args);
    try {
      if (delivery?.operation === 'account-deletion') {
        await postPlayService(
          delivery.request.gameId,
          'account-deletion',
          playAccountDeletionRequestSchema.parse(delivery.request)
        );
      } else if (
        delivery?.operation === 'retire' &&
        (await postPlayService(
          delivery.request.gameId,
          'retire',
          playRetireFixtureRequestSchema.parse(delivery.request)
        ))
      ) {
        await ctx.runMutation(internal.playDeletion.settleUnopenedDeletion, args);
      }
    } catch {
      // Only the authenticated acknowledgement, or an emptied room, retires this event. The retry is already durable.
    }
    return null;
  },
});

function isUnopened(game: Doc<'play_games'>) {
  return game.state === 'expired' && game.fixture_key !== PLAY_FIXTURE_KEY;
}

/** The room of a game that never opened answered its retirement, so it holds nothing of the account. */
export const settleUnopenedDeletion = internalMutation({
  args: { eventId: v.id('play_account_deletions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const game = event && (await ctx.db.get(event.game_id));
    if (event?.state === 'pending' && game && isUnopened(game)) {
      await ctx.db.patch(event._id, { state: 'acknowledged' });
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

/* Doubling from one second, a retirement keeps trying for about 18 hours, well past a Worker release that ships after the backend. */
const RETIRE_ATTEMPTS = 17;
const SETTLE_PAGE = 64;

/**
 * Closes the hosted fixture for good (#1535): no player has opened it since admission stopped (#1505), and a room holding a request from before requests named their seat (#1172) no longer loads (#1407), so deletions routed to it could never be acknowledged.
 * The room is asked to delete everything it stored, the deleted accounts' names included.
 * Only once it has answered does its routing go, and then its pending deletions settle.
 */
export async function retireHostedFixture(ctx: MutationCtx, game: Doc<'play_games'>) {
  if (game.fixture_key !== PLAY_FIXTURE_KEY || game.state !== 'ready') {
    return;
  }
  await ctx.db.patch(game._id, { state: 'expired' });
  await ctx.scheduler.runAfter(0, internal.playDeletion.retireFixtureRoom, { gameId: game._id, attempt: 0 });
}

async function retiredFixture(ctx: QueryCtx, gameId: Id<'play_games'>) {
  const game = await ctx.db.get(gameId);
  return game?.fixture_key === PLAY_FIXTURE_KEY && game.state === 'expired' ? game : null;
}

export const retiredFixtureCredentials = internalQuery({
  args: { gameId: v.id('play_games') },
  returns: v.union(v.object({ gameId: v.id('play_games'), secret: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const game = await retiredFixture(ctx, args.gameId);
    return game ? { gameId: game._id, secret: game.secret } : null;
  },
});

/**
 * Asks the retired fixture's room to delete what it stored, retrying with backoff.
 * The room answers again once empty.
 * A chain that gives up leaves the deletions pending, so running this action again by hand, from attempt 0, picks up where it stopped.
 */
export const retireFixtureRoom = internalAction({
  args: { gameId: v.id('play_games'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const credentials = await ctx.runQuery(internal.playDeletion.retiredFixtureCredentials, { gameId: args.gameId });
      if (!credentials) {
        return null;
      }
      if (await postPlayService(args.gameId, 'retire', playRetireFixtureRequestSchema.parse(credentials))) {
        await ctx.runMutation(internal.playDeletion.dropRetiredFixtureRouting, { gameId: args.gameId });
        return null;
      }
    } catch {
      /* A lost request or a failed read is retried below like a refused retirement. */
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

/**
 * The room holds nothing any more, so each deletion routed to it is done, one page per transaction.
 * Its routing is already gone, so no new deletion can join behind the cursor.
 */
export const settleRetiredFixture = internalMutation({
  args: { gameId: v.id('play_games'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await retiredFixture(ctx, args.gameId))) {
      return null;
    }
    const page = await ctx.db
      .query('play_account_deletions')
      .withIndex('by_game_id_operation_id', (q) => q.eq('game_id', args.gameId))
      .paginate({ cursor: args.cursor, numItems: SETTLE_PAGE });
    for (const event of page.page) {
      if (event.state === 'pending') {
        await ctx.db.patch(event._id, { state: 'acknowledged' });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.playDeletion.settleRetiredFixture, {
        gameId: args.gameId,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/** Routing to a retired room would only queue deletions nothing can deliver; once it is gone, the deletions settle. */
export const dropRetiredFixtureRouting = internalMutation({
  args: { gameId: v.id('play_games') },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await retiredFixture(ctx, args.gameId))) {
      return null;
    }
    const routings = await ctx.db
      .query('play_game_accounts')
      .withIndex('by_game_id_user_id', (q) => q.eq('game_id', args.gameId))
      .take(SETTLE_PAGE);
    for (const routing of routings) {
      await ctx.db.delete(routing._id);
    }
    if (routings.length === SETTLE_PAGE) {
      await ctx.scheduler.runAfter(0, internal.playDeletion.dropRetiredFixtureRouting, { gameId: args.gameId });
    } else {
      await ctx.scheduler.runAfter(0, internal.playDeletion.settleRetiredFixture, {
        gameId: args.gameId,
        cursor: null,
      });
    }
    return null;
  },
});
