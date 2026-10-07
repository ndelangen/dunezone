import { ConvexError } from 'convex/values';

import {
  normalizePlayGameSlug,
  PLAY_RESERVED_GAME_ADDRESSES,
  playGameNameSchema,
} from '../../src/shared/play/gameNames';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { generatePlayGameName } from './playGameNames';
import { selectSlug } from './slugAllocation';

const GENERATED_NAME_DRAWS = 4;

function retryAllocation(): never {
  throw new ConvexError({
    code: 'PLAY_GAME_ADDRESS_RETRY',
    retryable: true,
    message: 'Please try creating the game again.',
  });
}

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

async function allocateSlug(ctx: MutationCtx, base: string, accept?: (slug: string) => boolean): Promise<string> {
  const cursor = await ctx.db
    .query('play_game_slug_cursors')
    .withIndex('by_base', (q) => q.eq('base', base))
    .unique();
  const selection = await selectSlug({
    base,
    nextSuffix: cursor?.next_suffix ?? 1,
    available: async (slug) => await playGameAddressAvailable(ctx, slug),
    accept,
  });
  if (!selection) {
    return retryAllocation();
  }
  if (selection.nextSuffix !== null) {
    if (cursor) {
      await ctx.db.patch(cursor._id, { next_suffix: selection.nextSuffix });
    } else {
      await ctx.db.insert('play_game_slug_cursors', { base, next_suffix: selection.nextSuffix });
    }
  }
  await ctx.db.insert('play_game_slug_reservations', { slug: selection.slug });
  return selection.slug;
}

async function generateAvailableName(ctx: MutationCtx) {
  let name = generatePlayGameName();
  for (let draw = 1; draw < GENERATED_NAME_DRAWS; draw += 1) {
    if (await playGameAddressAvailable(ctx, normalizePlayGameSlug(name))) {
      break;
    }
    name = generatePlayGameName();
  }
  return name;
}

/** A supplied name has already passed moderation in its caller; no public creation call accepts it yet. */
export async function allocatePlayGameName(
  ctx: MutationCtx,
  suppliedName?: string,
  accept?: (slug: string) => boolean
) {
  const parsed = playGameNameSchema.safeParse(suppliedName ?? (await generateAvailableName(ctx)));
  if (!parsed.success) {
    throw new ConvexError({
      code: 'PLAY_GAME_NAME_INVALID',
      message: parsed.error.issues.map((issue) => issue.message).join(' '),
    });
  }
  return { name: parsed.data, slug: await allocateSlug(ctx, normalizePlayGameSlug(parsed.data), accept) };
}
