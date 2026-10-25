import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { playGameAccessSchema, playGameAddressAccessSchema } from '../src/shared/play/admission';
import { PLAY_RESERVED_GAME_ADDRESSES } from '../src/shared/play/gameNamePolicy';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './_generated/server';
import { newestUnusedRefresh } from './lib/authSessionLifecycle';
import { admitsPlayers, currentPlaySession, isRealGame } from './lib/playAuthorization';
import { enrolment, seatPassFor } from './lib/playSeatPass';
import { viewerQuery } from './queryAudience';

/** What a game page learns before it opens a socket: any signed-in player may enter a game that admits players, and an unknown id or the closed hosted fixture reads as not found. */
export const getGame = viewerQuery({
  args: { gameId: v.string() },
  returns: zodToConvex(playGameAccessSchema),
  handler: async (ctx, args) => {
    const session = await currentPlaySession(ctx);
    if (!session) {
      return { status: 'sign_in_required' as const };
    }
    const id = ctx.db.normalizeId('play_games', args.gameId);
    const game = id ? await ctx.db.get(id) : null;
    if (!game || !admitsPlayers(game)) {
      return { status: 'not_found' as const };
    }
    return await gameAccess(ctx, game);
  },
});

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
    const access = await gameAccess(ctx, game);
    return {
      ...access,
      gameId: game._id,
      name: game.name,
      slug: game.slug,
      ...(access.status === 'ready' ? { pass: await queryPass(ctx, game, session) } : {}),
    };
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

/** What an admitted viewer learns about the game in its current state. */
async function gameAccess(ctx: QueryCtx, game: Doc<'play_games'>) {
  switch (game.state) {
    case 'pending':
      return { status: 'preparing' as const };
    case 'expired':
      return { status: 'unavailable' as const, ...(game.provision_error ? { reason: game.provision_error } : {}) };
    case 'ready': {
      const ruleset = game.ruleset_id ? await ctx.db.get('rulesets', game.ruleset_id) : null;
      return readyGame(game, ruleset);
    }
  }
}

function readyGame(game: Doc<'play_games'>, ruleset: Doc<'rulesets'> | null) {
  return {
    status: 'ready' as const,
    gameId: game._id,
    name: isRealGame(game) ? (ruleset?.name ?? 'Game') : 'Hosted fixture',
    ruleset: ruleset ? { slug: ruleset.slug, name: ruleset.name } : null,
    minimumPlayers: game.minimum_players ?? null,
  };
}
