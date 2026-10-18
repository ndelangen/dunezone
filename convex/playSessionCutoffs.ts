import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { playAckSessionCutoffRequestSchema, playSessionCutoffRequestSchema } from '../src/shared/play/admission';
import { PLAY_SEAT_PASS_TTL_MS } from '../src/shared/play/seatPass';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalAction } from './_generated/server';
import { internalMutation, mutation } from './functions';
import { authenticatedPlayRequest } from './lib/playAuthorization';
import { postPlayService } from './lib/playService';
import { queueCutoffPage } from './lib/playSessionCutoffQueue';

/*
 * Account-wide sign-outs pushed to the rooms an account plays in, so a seat pass from a revoked session stops working there before it expires.
 * The shape follows account deletion (playDeletion.ts): the retry is persisted before each request, and only the room's authenticated acknowledgement ends it.
 */

const PAGE = 32;
/* Allows for the room's clock running behind this deployment's. */
const CLOCK_MARGIN_MS = 60_000;

export const queueAccountCutoff = internalMutation({
  args: { principalId: v.id('users'), through: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await queueCutoffPage(ctx, args.principalId, args.through, args.cursor);
    return null;
  },
});

function isDue(event: Doc<'play_session_cutoffs'>) {
  return event.state === 'pending' && Date.now() >= event.next_attempt_at;
}

export const claimDelivery = internalMutation({
  args: { eventId: v.id('play_session_cutoffs') },
  returns: zodToConvex(playSessionCutoffRequestSchema.nullable()),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || !isDue(event)) {
      return null;
    }
    /* Every pass the cutoff ends has expired by now, since a revoked session is never signed a new one, so the push has nothing left to stop. */
    if (Date.now() >= event.through + PLAY_SEAT_PASS_TTL_MS + CLOCK_MARGIN_MS) {
      await ctx.db.delete(event._id);
      return null;
    }
    /* Capped at a minute: the pass lifetime bounds a lost cutoff anyway, so a long backoff would only waste it. */
    const nextAttemptAt = Date.now() + Math.min(60_000, 1000 * 2 ** Math.min(event.attempts, 6));
    await ctx.db.patch(event._id, { attempts: event.attempts + 1, next_attempt_at: nextAttemptAt });
    const game = await ctx.db.get(event.game_id);
    if (game?.state !== 'ready') {
      return null;
    }
    await ctx.scheduler.runAt(nextAttemptAt, internal.playSessionCutoffs.deliver, { eventId: event._id });
    return {
      gameId: game._id,
      secret: game.secret,
      eventId: event._id,
      principalId: event.principal_id,
      through: event.through,
    };
  },
});

export const deliver = internalAction({
  args: { eventId: v.id('play_session_cutoffs') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.runMutation(internal.playSessionCutoffs.claimDelivery, args);
    if (delivery) {
      try {
        await postPlayService(delivery.gameId, 'session-cutoff', playSessionCutoffRequestSchema.parse(delivery));
      } catch {
        // Only the room's acknowledgement retires this event. The retry is already durable.
      }
    }
    return null;
  },
});

/** The room names the cutoff it stored, so an acknowledgement for an older one leaves a raised cutoff pending. */
export const ackSessionCutoff = mutation({
  args: zodToConvex(playAckSessionCutoffRequestSchema),
  returns: v.null(),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playAckSessionCutoffRequestSchema);
    if (request?.game.state !== 'ready') {
      return null;
    }
    const id = ctx.db.normalizeId('play_session_cutoffs', request.args.eventId);
    const event = id ? await ctx.db.get(id) : null;
    if (event?.game_id === request.game._id && event.state === 'pending' && request.args.through >= event.through) {
      await ctx.db.patch(event._id, { state: 'acknowledged' });
    }
    return null;
  },
});

/** Repairs an action failure that happened before its claim could schedule a retry. */
export const retryDueCutoffs = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const due = await ctx.db
      .query('play_session_cutoffs')
      .withIndex('by_state_next_attempt_at', (q) => q.eq('state', 'pending').lte('next_attempt_at', Date.now()))
      .take(PAGE);
    for (const event of due) {
      await ctx.scheduler.runAfter(0, internal.playSessionCutoffs.deliver, { eventId: event._id });
    }
    return null;
  },
});
