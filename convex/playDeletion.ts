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
import { discordChannel, requestDiscordDeletion } from './lib/playDiscord';
import { postPlayService } from './lib/playService';

async function queueActorDeletion(
  ctx: MutationCtx,
  gameId: Id<'play_games'>,
  actorId: Id<'users'>,
  operation: Doc<'account_deletion_operations'>,
  banRetirement = false
) {
  const previous = await ctx.db
    .query('play_account_deletions')
    .withIndex('by_game_operation_user', (q) =>
      q.eq('game_id', gameId).eq('operation_id', operation._id).eq('user_id', actorId)
    )
    .unique();
  if (previous) {
    if (banRetirement && !previous.ban_retirement) {
      await ctx.db.patch(previous._id, { ban_retirement: true, state: 'pending', next_attempt_at: Date.now() });
      await ctx.scheduler.runAfter(0, internal.playDeletion.deliver, { eventId: previous._id });
    }
    return;
  }
  const eventId = await ctx.db.insert('play_account_deletions', {
    game_id: gameId,
    user_id: actorId,
    operation_id: operation._id,
    ...(banRetirement ? { ban_retirement: true } : {}),
    state: 'pending',
    attempts: 0,
    next_attempt_at: Date.now(),
    created_at: Date.now(),
  });
  await ctx.scheduler.runAfter(0, internal.playDeletion.deliver, { eventId });
}

async function queueGameDeletion(
  ctx: MutationCtx,
  routing: Doc<'play_game_accounts'>,
  operation: Doc<'account_deletion_operations'>
) {
  await ctx.db.patch(routing._id, { deletion_operation_id: operation._id });
  for (const actorId of routing.actor_user_ids ?? [routing.user_id]) {
    await queueActorDeletion(ctx, routing.game_id, actorId, operation);
  }
}

async function queueDeletionPage(
  ctx: MutationCtx,
  args: { operationId: Id<'account_deletion_operations'>; paginationOpts: PaginationOptions }
) {
  const operation = await ctx.db.get(args.operationId);
  if (!operation || (operation.kind === 'ban' && operation.ban_accounts_queued)) {
    return;
  }
  const page = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_user_id', (q) => q.eq('user_id', operation.source_user_id))
    .paginate(
      operation.kind === 'ban' ? { cursor: operation.ban_accounts_cursor ?? null, numItems: 32 } : args.paginationOpts
    );
  for (const routing of page.page) {
    await queueGameDeletion(ctx, routing, operation);
  }
  if (operation.kind === 'ban') {
    await ctx.db.patch(operation._id, {
      ban_accounts_cursor: page.continueCursor,
      ban_accounts_queued: page.isDone,
    });
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.playDeletion.queueAccountDeletion, {
      operationId: operation._id,
      paginationOpts: { cursor: page.continueCursor, numItems: 32 },
    });
  }
}

/** Expiring each hosted game closes its page and admission before any external cleanup request. */
async function queueBanGamesPage(ctx: MutationCtx, operation: Doc<'account_deletion_operations'>) {
  if (operation.kind !== 'ban' || operation.ban_games_queued) {
    return;
  }
  const page = await ctx.db
    .query('play_games')
    .withIndex('by_creator_id', (q) => q.eq('creator_id', operation.source_user_id))
    .paginate({ cursor: operation.ban_games_cursor ?? null, numItems: 16 });
  for (const game of page.page) {
    await ctx.db.patch(game._id, { state: 'expired', ban_operation_id: operation._id });
    const channel = await discordChannel(ctx, game._id);
    if (channel && channel.state !== 'deleted' && channel.state !== 'deleting') {
      await requestDiscordDeletion(ctx, channel);
    }
    /* A creator may never have opened the game, so retirement must not depend on an admission routing row. */
    await queueActorDeletion(ctx, game._id, operation.source_user_id, operation, true);
  }
  await ctx.db.patch(operation._id, {
    ban_games_cursor: page.continueCursor,
    ban_games_queued: page.isDone,
  });
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.playDeletion.queueBanGames, { operationId: operation._id });
  }
}

/** Runs beside content disposal so a large asset inventory does not delay closing hosted games. */
export const queueBanGames = internalMutation({
  args: { operationId: v.id('account_deletion_operations') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (operation) {
      await queueBanGamesPage(ctx, operation);
    }
    return null;
  },
});

/** Both persisted cursors can resume here after a failed fan-out; delivery retries remain in their existing queue. */
export const applyBanGamesBatch = internalMutation({
  args: { operationId: v.id('account_deletion_operations') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation || operation.kind !== 'ban') {
      return { done: true };
    }
    /* Convex permits one paginated query per execution, so recovery advances one fan-out at a time. */
    if (!operation.ban_games_queued) {
      await queueBanGamesPage(ctx, operation);
    } else if (!operation.ban_accounts_queued) {
      await queueDeletionPage(ctx, { operationId: operation._id, paginationOpts: { cursor: null, numItems: 32 } });
    }
    const updated = await ctx.db.get(operation._id);
    const pending = await ctx.db
      .query('play_account_deletions')
      .withIndex('by_operation_id_state', (q) => q.eq('operation_id', operation._id).eq('state', 'pending'))
      .first();
    return { done: updated?.ban_games_queued === true && updated.ban_accounts_queued === true && !pending };
  },
});

async function isBanRetirement(ctx: QueryCtx, game: Doc<'play_games'>, event: Doc<'play_account_deletions'>) {
  const operation = await ctx.db.get(event.operation_id);
  return (
    event.ban_retirement === true &&
    operation?.kind === 'ban' &&
    game.ban_operation_id === operation._id &&
    game.state === 'expired'
  );
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
     * An expired game cannot admit anyone.
     * Ordinary expiry retires an unconfirmed room; an account-ban marker also retires a confirmed game.
     * The deletion settles only after the room answers that it has emptied.
     */
    if (isUnopened(game)) {
      await ctx.scheduler.runAt(nextAttemptAt, internal.playDeletion.deliver, { eventId: event._id });
      return {
        operation: 'retire' as const,
        request: {
          gameId: game._id,
          secret: game.secret,
          ...((await isBanRetirement(ctx, game, event)) ? { banOperationId: event.operation_id } : {}),
        },
      };
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

/** An expired room answered its retirement; a banned host's game also drops every player's routing before settlement. */
export const settleUnopenedDeletion = internalMutation({
  args: { eventId: v.id('play_account_deletions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    const game = event && (await ctx.db.get(event.game_id));
    if (event?.state === 'pending' && game && isUnopened(game)) {
      if (await isBanRetirement(ctx, game, event)) {
        const routings = await ctx.db
          .query('play_game_accounts')
          .withIndex('by_game_id_user_id', (q) => q.eq('game_id', game._id))
          .take(64);
        for (const routing of routings) {
          await ctx.db.delete(routing._id);
        }
        if (routings.length === 64) {
          await ctx.scheduler.runAfter(0, internal.playDeletion.settleUnopenedDeletion, args);
          return null;
        }
      }
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

/*
 * The hosted fixture was closed for good (#1535) by a one-off migration that marked it expired and started `retireFixtureRoom`.
 * The room retirement below stays as the manual resume while production may still hold fixture deletions it left pending.
 */

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
