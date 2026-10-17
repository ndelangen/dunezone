import { PLAY_SEAT_PASS_TTL_MS, signSeatPass } from '../../src/shared/play/seatPass';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalAccount, gameActorForAccount } from './accountIdentity';
import { accountStateOf } from './accountLifecycle';
import { admitsPlayers } from './playAuthorization';
import type { currentPlaySession } from './playAuthorization';
import { playerSummary } from './playerSummary';

type PlaySession = NonNullable<Awaited<ReturnType<typeof currentPlaySession>>>;

/** The account's routing row at this game: it is what deletion fan-out, merges and seat counting follow, so a pass is signed only for an enrolled account. */
export function enrolment(ctx: QueryCtx, gameId: Id<'play_games'>, userId: Id<'users'>) {
  return ctx.db
    .query('play_game_accounts')
    .withIndex('by_game_id_user_id', (q) => q.eq('game_id', gameId).eq('user_id', userId))
    .unique();
}

/**
 * Signs a pass for the signed-in account at a game that admits players.
 * `issuedAt` is the caller's clock: a mutation's own, or a query's stand-in, since a query may not read the clock.
 */
export async function seatPassFor(ctx: QueryCtx, game: Doc<'play_games'>, session: PlaySession, issuedAt: number) {
  if (game.state !== 'ready' || !admitsPlayers(game)) {
    return null;
  }
  const [user, authSession] = await Promise.all([canonicalAccount(ctx, session.userId), ctx.db.get(session.sessionId)]);
  if (!user || !authSession || accountStateOf(user) !== 'active') {
    return null;
  }
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', user._id))
    .unique();
  return await signSeatPass(game.secret, {
    v: 1,
    gameId: game._id,
    actorId: await gameActorForAccount(ctx, game._id, user._id),
    principalId: user._id,
    sessionId: session.sessionId,
    sessionCreatedAt: authSession._creationTime,
    issuedAt,
    exp: Math.min(session.authExpiresAt, issuedAt + PLAY_SEAT_PASS_TTL_MS),
    ...playerSummary(profile),
  });
}

/**
 * Enrols an active account at a game, in the same transaction that checks it may still play there.
 * A deletion already under way finds the new row through its own fan-out cursor, or has closed admission first.
 */
export async function enrol(ctx: MutationCtx, gameId: Id<'play_games'>, userId: Id<'users'>) {
  const user = await canonicalAccount(ctx, userId);
  if (!user || accountStateOf(user) !== 'active') {
    return false;
  }
  if (!(await enrolment(ctx, gameId, user._id))) {
    await ctx.db.insert('play_game_accounts', {
      game_id: gameId,
      user_id: user._id,
      actor_user_ids: [await gameActorForAccount(ctx, gameId, user._id)],
    });
  }
  return true;
}
