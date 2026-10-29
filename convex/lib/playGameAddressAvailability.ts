import { PLAY_RESERVED_GAME_ADDRESSES } from '../../src/shared/play/gameNamePolicy';
import type { QueryCtx } from '../_generated/server';

/** Exact indexed absence reads participate in the same transaction as reservation and game insertion. */
export async function playGameAddressAvailable(ctx: Pick<QueryCtx, 'db'>, slug: string): Promise<boolean> {
  if ((PLAY_RESERVED_GAME_ADDRESSES as readonly string[]).includes(slug) || ctx.db.normalizeId('play_games', slug)) {
    return false;
  }
  const reservation = await ctx.db
    .query('play_game_slug_reservations')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (reservation) {
    return false;
  }
  const game = await ctx.db
    .query('play_games')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  return game === null;
}
