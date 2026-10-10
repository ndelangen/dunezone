import type { Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';

/** Merge aliases are flattened by the transfer job; the bounded walk also covers an in-progress chained merge. */
export async function canonicalAccount(ctx: QueryCtx, id: Id<'users'>) {
  let user = await ctx.db.get(id);
  for (let depth = 0; user?.merged_into_user_id && depth < 16; depth += 1) {
    user = await ctx.db.get(user.merged_into_user_id);
  }
  return user?.merged_into_user_id ? null : user;
}

export async function gameActorIds(ctx: QueryCtx, gameId: Id<'play_games'>, userId: Id<'users'>) {
  const routing = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_game_id_user_id', (q) => q.eq('game_id', gameId).eq('user_id', userId))
    .unique();
  return routing?.actor_user_ids ?? [userId];
}

export async function gameActorForAccount(ctx: QueryCtx, gameId: Id<'play_games'>, userId: Id<'users'>) {
  const actors = await gameActorIds(ctx, gameId, userId);
  const game = await ctx.db.get(gameId);
  const seated = game?.directory?.seats.find((seat) => actors.includes(seat.userId as Id<'users'>));
  const creator = game?.creator_actor_id ?? game?.creator_id;
  return seated
    ? (seated.userId as Id<'users'>)
    : creator && actors.includes(creator)
      ? creator
      : actors.includes(userId)
        ? userId
        : (actors[0] ?? userId);
}
