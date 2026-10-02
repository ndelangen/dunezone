import { PLAY_SEAT_LIMIT } from '../../src/shared/play/seatLimit';
import type { Doc, Id } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import { isRealGame } from './playAuthorization';

/*
 * How many rows each of the two candidate lists may read.
 * Both are read newest first, so a seat in a game the player created or first entered before their newest
 * PLAY_SEAT_SCAN_LIMIT games is missed and the count runs low. That leaves a player who has watched hundreds
 * of games able to go over the limit, and it keeps creation and admission within a transaction's reads.
 */
const PLAY_SEAT_SCAN_LIMIT = 200;

/**
 * Whether a game holds a seat for the player.
 * The directory summary the game Worker published decides it, except in a finished, discarded or expired game, which holds none.
 * A real game with no summary yet holds its creator's seat, since the creator is seated from creation.
 */
function holdsSeat(game: Doc<'play_games'>, userId: Id<'users'>) {
  if (game.state === 'expired') {
    return false;
  }
  const summary = game.directory;
  if (!summary) {
    return isRealGame(game) && game.creator_id === userId;
  }
  if (summary.stage === 'finished' || summary.stage === 'discarded') {
    return false;
  }
  return summary.seats.some((seat) => seat.userId === userId);
}

/**
 * The games that may hold a seat for the player, each once and without the game named in `except`.
 * The games they created come first, then the games they entered, both newest first.
 * @yields Each candidate game.
 */
async function* candidateGames(ctx: QueryCtx, userId: Id<'users'>, except?: Id<'play_games'>) {
  const seen = new Set<Id<'play_games'>>(except ? [except] : []);
  const created = await ctx.db
    .query('play_games')
    .withIndex('by_creator_id', (q) => q.eq('creator_id', userId))
    .order('desc')
    .take(PLAY_SEAT_SCAN_LIMIT);
  for (const game of created) {
    seen.add(game._id);
    if (game._id !== except) {
      yield game;
    }
  }
  const entered = await ctx.db
    .query('play_game_accounts')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .order('desc')
    .take(PLAY_SEAT_SCAN_LIMIT);
  for (const { game_id } of entered) {
    if (seen.has(game_id)) {
      continue;
    }
    seen.add(game_id);
    const game = await ctx.db.get(game_id);
    if (game) {
      yield game;
    }
  }
}

/**
 * Whether the player holds `PLAY_SEAT_LIMIT` seats, not counting the game named in `except`.
 * Admission leaves out the game being entered, so a player who left a seat there can ask for one again.
 * The count stops at the limit.
 */
export async function atPlaySeatLimit(ctx: QueryCtx, userId: Id<'users'>, except?: Id<'play_games'>) {
  let seats = 0;
  for await (const game of candidateGames(ctx, userId, except)) {
    seats += holdsSeat(game, userId) ? 1 : 0;
    if (seats >= PLAY_SEAT_LIMIT) {
      return true;
    }
  }
  return false;
}
