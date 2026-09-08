import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import { playAccountDeletionRequestSchema } from '../src/shared/play/admission';
import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { internalMutation } from './functions';
import { postPlayService } from './lib/playService';

/** Account deletion closes admission before this bounded fan-out starts, so routing cannot grow behind the cursor. */
export const queueAccountDeletion = internalMutation({
  args: { operationId: v.id('account_deletion_operations'), paginationOpts: paginationOptsValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const operation = await ctx.db.get(args.operationId);
    if (!operation) {
      return null;
    }
    const page = await ctx.db
      .query('play_game_accounts')
      .withIndex('by_user_id', (q) => q.eq('user_id', operation.source_user_id))
      .paginate({ ...args.paginationOpts, numItems: 32 });
    for (const routing of page.page) {
      await ctx.db.patch(routing._id, { deletion_operation_id: operation._id });
      const previous = await ctx.db
        .query('play_account_deletions')
        .withIndex('by_game_id_operation_id', (q) => q.eq('game_id', routing.game_id).eq('operation_id', operation._id))
        .unique();
      if (!previous) {
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
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.playDeletion.queueAccountDeletion, {
        operationId: operation._id,
        paginationOpts: { cursor: page.continueCursor, numItems: 32 },
      });
    }
    return null;
  },
});

/** Claiming a delivery also persists its next retry, before any external request can fail. */
export const claimDelivery = internalMutation({
  args: { eventId: v.id('play_account_deletions') },
  returns: v.union(
    v.null(),
    v.object({
      gameId: v.string(),
      secret: v.string(),
      eventId: v.string(),
      userId: v.string(),
      deletionOperationId: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || event.state !== 'pending' || Date.now() < event.next_attempt_at) {
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
    if (!delivery) {
      return null;
    }
    try {
      await postPlayService(delivery.gameId, 'account-deletion', playAccountDeletionRequestSchema.parse(delivery));
    } catch {
      // Only the authenticated acknowledgement retires this event. The retry is already durable.
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
