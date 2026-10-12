import { z } from 'zod';

import { normalizePlayGameSlug, PLAY_RESERVED_GAME_ADDRESSES, playGameNameSchema } from '../src/shared/play/gameNames';
import { generatePlayGameName } from '../src/shared/play/generatedGameNames';
import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { allocatePlayGameName } from './lib/playGameAddresses';
import { hasLocalPlayGameProfanity } from './lib/playGameNameChecks';

const retainedPair = z.object({
  name: playGameNameSchema.refine((name) => !hasLocalPlayGameProfanity(name)),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .refine((slug) => !(PLAY_RESERVED_GAME_ADDRESSES as readonly string[]).includes(slug))
    .refine((slug) => !hasLocalPlayGameProfanity(slug)),
});

/** Only a canonical counter suffix relative to the stored name advances that name's cursor. */
function gameNameCounter(name: string, slug: string) {
  const base = normalizePlayGameSlug(name);
  if (!slug.startsWith(`${base}-`)) {
    return null;
  }
  const suffix = slug.slice(base.length + 1);
  const counter = Number.parseInt(suffix, 36);
  if (!Number.isSafeInteger(counter)) {
    return null;
  }
  if (counter < 1 || counter.toString(36) !== suffix) {
    return null;
  }
  return { base, next: Math.min(counter + 1, Number.MAX_SAFE_INTEGER) };
}

async function ensureReservation(ctx: MutationCtx, slug: string) {
  const reservation = await ctx.db
    .query('play_game_slug_reservations')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!reservation) {
    await ctx.db.insert('play_game_slug_reservations', { slug });
  }
}

async function advanceCounter(ctx: MutationCtx, name: string, slug: string) {
  const counter = gameNameCounter(name, slug);
  if (!counter) {
    return;
  }
  const cursor = await ctx.db
    .query('play_game_slug_cursors')
    .withIndex('by_base', (q) => q.eq('base', counter.base))
    .unique();
  if (!cursor) {
    await ctx.db.insert('play_game_slug_cursors', { base: counter.base, next_suffix: counter.next });
  } else if (cursor.next_suffix < counter.next) {
    await ctx.db.patch(cursor._id, { next_suffix: counter.next });
  }
}

async function verifyCounter(ctx: QueryCtx | MutationCtx, name: string, slug: string) {
  const counter = gameNameCounter(name, slug);
  if (!counter) {
    return;
  }
  const cursor = await ctx.db
    .query('play_game_slug_cursors')
    .withIndex('by_base', (q) => q.eq('base', counter.base))
    .unique();
  if (!cursor) {
    throw new Error('Game address cursor is missing');
  }
  if (!Number.isSafeInteger(cursor.next_suffix) || cursor.next_suffix < counter.next) {
    throw new Error('Game address cursor is outdated');
  }
}

/** Indexed checks verify uniqueness, permanent reservation and counter catch-up without exposing credentials. */
export async function verifyGameName(ctx: QueryCtx | MutationCtx, game: Doc<'play_games'>) {
  const parsed = retainedPair.safeParse(game);
  if (!parsed.success) {
    throw new Error(`Game ${game._id} has an invalid name or address`);
  }
  const { name, slug } = parsed.data;
  if (name !== game.name || ctx.db.normalizeId('play_games', slug)) {
    throw new Error(`Game ${game._id} has a noncanonical name or address`);
  }
  const owner = await ctx.db
    .query('play_games')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (owner?._id !== game._id) {
    throw new Error(`Game ${game._id} has no unique address`);
  }
  const reservation = await ctx.db
    .query('play_game_slug_reservations')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!reservation) {
    throw new Error(`Game ${game._id} has no permanent reservation`);
  }
  await verifyCounter(ctx, name, slug);
}

/** Repairs only absent fields, including retired fixtures, without touching gameplay or provisioning. */
export async function backfillGameName(ctx: MutationCtx, game: Doc<'play_games'>) {
  const named =
    game.slug === undefined
      ? await allocatePlayGameName(ctx, game.name)
      : { name: game.name ?? generatePlayGameName(), slug: game.slug };
  await ensureReservation(ctx, named.slug);
  await advanceCounter(ctx, named.name, named.slug);
  if (game.name !== named.name || game.slug !== named.slug) {
    await ctx.db.patch(game._id, named);
  }
  await verifyGameName(ctx, { ...game, ...named });
}
