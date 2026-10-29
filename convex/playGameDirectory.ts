import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { playGameAddressAccessSchema } from '../src/shared/play/admission';
import { PLAY_RESERVED_GAME_ADDRESSES } from '../src/shared/play/gameNamePolicy';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { newestUnusedRefresh } from './lib/authSessionLifecycle';
import { admitsPlayers, currentPlaySession } from './lib/playAuthorization';
import { enrolment, seatPassFor } from './lib/playSeatPass';
import { viewerQuery } from './queryAudience';

/** Resolves a friendly address or legacy ID without granting access or changing the game's identity. */
export const getGameByAddress = viewerQuery({
  args: { address: v.string() },
  returns: zodToConvex(playGameAddressAccessSchema),
  handler: async (ctx, { address }) => {
    const session = await currentPlaySession(ctx);
    if (!session) {
      return { status: 'sign_in_required' as const };
    }
    if ((PLAY_RESERVED_GAME_ADDRESSES as readonly string[]).includes(address)) {
      return { status: 'not_found' as const };
    }
    /* Every token the old resolver accepts stays in its namespace, even when its game no longer exists. */
    const id = ctx.db.normalizeId('play_games', address);
    const game = id
      ? await ctx.db.get(id)
      : await ctx.db
          .query('play_games')
          /* Stored addresses are lowercase, so a hand-typed or auto-capitalised link still finds its game; the page then moves to the stored spelling. */
          .withIndex('by_slug', (q) => q.eq('slug', address.toLowerCase()))
          .unique();
    if (!game || !admitsPlayers(game)) {
      return { status: 'not_found' as const };
    }
    return await gameAccess(ctx, game, session);
  },
});

/*
 * The pass is stamped with the session's newest refresh: a query may not read the clock, and each sign-in refresh both rotates that row and re-runs this query, so the pass renews itself while the tab stays signed in.
 * The page renews through `playAdmission.renewSeatPass` only when no refresh arrived before the pass nears its end.
 */
async function queryPass(
  ctx: QueryCtx,
  game: Doc<'play_games'>,
  session: NonNullable<Awaited<ReturnType<typeof currentPlaySession>>>
) {
  const [routing, refresh] = await Promise.all([
    enrolment(ctx, game._id, session.userId),
    newestUnusedRefresh(ctx, session.sessionId),
  ]);
  return routing && refresh ? await seatPassFor(ctx, game, session, refresh._creationTime) : null;
}

/** What an admitted viewer learns about the game in its current state, with their seat pass once it is ready. */
async function gameAccess(
  ctx: QueryCtx,
  game: Doc<'play_games'>,
  session: NonNullable<Awaited<ReturnType<typeof currentPlaySession>>>
) {
  const address = { gameId: game._id, name: game.name, slug: game.slug };
  switch (game.state) {
    case 'pending':
      return { status: 'preparing' as const, ...address };
    case 'expired':
      return {
        status: 'unavailable' as const,
        ...address,
        ...(game.provision_error ? { reason: game.provision_error } : {}),
      };
    case 'ready': {
      const ruleset = game.ruleset_id ? await ctx.db.get('rulesets', game.ruleset_id) : null;
      return {
        status: 'ready' as const,
        ...address,
        ruleset: ruleset ? { slug: ruleset.slug, name: ruleset.name } : null,
        minimumPlayers: game.minimum_players ?? null,
        pass: await queryPass(ctx, game, session),
      };
    }
  }
}
