import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import {
  playAckAccountDeletionRequestSchema,
  playSeatLimitRequestSchema,
  playSeatLimitResultSchema,
  playSeatPassRequestSchema,
  playSeatPassResultSchema,
} from '../src/shared/play/admission';
import type { MutationCtx } from './_generated/server';
import { mutation, publicQuery } from './functions';
import { canonicalAccount } from './lib/accountIdentity';
import { admitsPlayers, authenticatedPlayRequest, livePlaySession } from './lib/playAuthorization';
import { playPassQuota } from './lib/playRateLimits';
import { enrol, enrolment, seatPassFor } from './lib/playSeatPass';
import { atPlaySeatLimit } from './lib/playSeats';

/** A mutation may read the clock, so its pass runs a full lifetime from now. */
async function mutationPass(
  ctx: MutationCtx,
  input: unknown,
  enrolFirst: boolean
): Promise<ReturnType<typeof playSeatPassResultSchema.parse>> {
  const session = await livePlaySession(ctx);
  if (!session) {
    return { ok: false as const, reason: 'not_authorized' as const };
  }
  const limited = await playPassQuota(ctx, session.userId);
  if (limited) {
    return limited;
  }
  const request = playSeatPassRequestSchema.safeParse(input);
  const gameId = request.success ? ctx.db.normalizeId('play_games', request.data.gameId) : null;
  const game = gameId ? await ctx.db.get(gameId) : null;
  if (game?.state !== 'ready' || !admitsPlayers(game)) {
    return { ok: false as const, reason: 'unavailable' as const };
  }
  if (enrolFirst ? !(await enrol(ctx, game._id, session.userId)) : !(await enrolment(ctx, game._id, session.userId))) {
    return { ok: false as const, reason: 'not_authorized' as const };
  }
  const pass = await seatPassFor(ctx, game, session, Date.now());
  return pass ? { ok: true as const, pass } : { ok: false as const, reason: 'not_authorized' as const };
}

/** Enrols the signed-in account at a game it opens for the first time, so deletion and merges reach the room, and returns its first pass. */
export const enrolPlayer = mutation({
  args: zodToConvex(playSeatPassRequestSchema),
  returns: zodToConvex(playSeatPassResultSchema),
  handler: async (ctx, args) => await mutationPass(ctx, args, true),
});

/** A fresh pass for an enrolled account whose held one nears its end before the game query brought a new one. */
export const renewSeatPass = mutation({
  args: zodToConvex(playSeatPassRequestSchema),
  returns: zodToConvex(playSeatPassResultSchema),
  handler: async (ctx, args) => await mutationPass(ctx, args, false),
});

async function acknowledgeDeletion(
  ctx: MutationCtx,
  input: ReturnType<typeof playAckAccountDeletionRequestSchema.parse>
) {
  const request = await authenticatedPlayRequest(ctx, input, playAckAccountDeletionRequestSchema);
  if (request?.game.state !== 'ready') {
    return;
  }
  const { game, args } = request;
  const id = ctx.db.normalizeId('play_account_deletions', args.eventId);
  const event = id ? await ctx.db.get(id) : null;
  if (event?.game_id === game._id && event.state === 'pending') {
    await ctx.db.patch(event._id, { state: 'acknowledged' });
  }
}

export const ackAccountDeletion = mutation({
  args: zodToConvex(playAckAccountDeletionRequestSchema),
  returns: v.null(),
  handler: async (ctx, args) => {
    await acknowledgeDeletion(ctx, args);
    return null;
  },
});

/** Whether the account behind a game actor holds the seat limit in other games; an unknown account reads as at it, so the room refuses. */
export const seatLimitReached = publicQuery({
  args: zodToConvex(playSeatLimitRequestSchema),
  returns: zodToConvex(playSeatLimitResultSchema),
  handler: async (ctx, input) => {
    const request = await authenticatedPlayRequest(ctx, input, playSeatLimitRequestSchema);
    if (request?.game.state !== 'ready') {
      return { ok: false as const };
    }
    const id = ctx.db.normalizeId('users', request.args.userId);
    const user = id ? await canonicalAccount(ctx, id) : null;
    return { ok: true as const, reached: user ? await atPlaySeatLimit(ctx, user._id, request.game._id) : true };
  },
});
