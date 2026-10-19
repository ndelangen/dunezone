import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/* Queues the account-wide sign-out pushes that convex/playSessionCutoffs.ts delivers. */

const PAGE = 32;

/** Queues the cutoff for one game, folding it into a pending one for the same account. */
export async function queueSessionCutoff(
  ctx: MutationCtx,
  gameId: Id<'play_games'>,
  principalId: Id<'users'>,
  through: number
) {
  const previous = await ctx.db
    .query('play_session_cutoffs')
    .withIndex('by_game_id_principal_id', (q) => q.eq('game_id', gameId).eq('principal_id', principalId))
    .unique();
  if (previous && previous.through >= through) {
    return;
  }
  const fields = { through, state: 'pending' as const, attempts: 0, next_attempt_at: Date.now() };
  const eventId = previous
    ? (await ctx.db.patch(previous._id, fields), previous._id)
    : await ctx.db.insert('play_session_cutoffs', { game_id: gameId, principal_id: principalId, ...fields });
  await ctx.scheduler.runAfter(0, internal.playSessionCutoffs.deliver, { eventId });
}

export async function queueCutoffPage(
  ctx: MutationCtx,
  principalId: Id<'users'>,
  through: number,
  cursor: string | null
) {
  const page = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_user_id', (q) => q.eq('user_id', principalId))
    .paginate({ cursor, numItems: PAGE });
  for (const routing of page.page) {
    await queueSessionCutoff(ctx, routing.game_id, principalId, through);
  }
  if (!page.isDone) {
    await ctx.scheduler.runAfter(0, internal.playSessionCutoffs.queueAccountCutoff, {
      principalId,
      through,
      cursor: page.continueCursor,
    });
  }
}

/** Fans one account-wide sign-out out over every game the account is enrolled in, one page per transaction. */
export async function queueAccountCutoffs(ctx: MutationCtx, principalId: Id<'users'>, through: number) {
  await queueCutoffPage(ctx, principalId, through, null);
}
