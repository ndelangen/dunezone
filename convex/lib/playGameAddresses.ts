import { ConvexError } from 'convex/values';

import {
  normalizePlayGameSlug,
  PLAY_RESERVED_GAME_ADDRESSES,
  playGameNameSchema,
} from '../../src/shared/play/gameNames';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { generatePlayGameName } from './playGameNames';

const GENERATED_NAME_DRAWS = 4;
export const PLAY_GAME_ADDRESS_PROBES = 32;

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

/** Explicit numeric names advance the parent base's high-water mark, even when entered before that base. */
async function catchUpSuffixCursor(ctx: MutationCtx, slug: string) {
  const match = /^(.*)-([1-9][0-9]*)$/.exec(slug);
  if (!match) {
    return;
  }
  const [, base, digits] = match;
  const suffix = Number(digits);
  if (!Number.isSafeInteger(suffix)) {
    return;
  }
  await advanceSuffixCursor(ctx, base!, suffix + 1);
}

async function advanceSuffixCursor(ctx: MutationCtx, base: string, next: number) {
  const cursor = await ctx.db
    .query('play_game_slug_cursors')
    .withIndex('by_base', (q) => q.eq('base', base))
    .unique();
  if (cursor) {
    if (cursor.next_suffix < next) {
      await ctx.db.patch('play_game_slug_cursors', cursor._id, { next_suffix: next });
    }
  } else {
    await ctx.db.insert('play_game_slug_cursors', { base, next_suffix: next });
  }
}

async function reserve(ctx: MutationCtx, slug: string) {
  await ctx.db.insert('play_game_slug_reservations', { slug });
  await catchUpSuffixCursor(ctx, slug);
  return slug;
}

async function allocateSlug(ctx: MutationCtx, base: string): Promise<string> {
  if (await playGameAddressAvailable(ctx, base)) {
    return await reserve(ctx, base);
  }
  const cursor = await ctx.db
    .query('play_game_slug_cursors')
    .withIndex('by_base', (q) => q.eq('base', base))
    .unique();
  let suffix = Math.max(1, cursor?.next_suffix ?? 1);
  for (let probe = 0; probe < PLAY_GAME_ADDRESS_PROBES; probe += 1, suffix += 1) {
    if (!Number.isSafeInteger(suffix) || suffix >= Number.MAX_SAFE_INTEGER) {
      retryAllocation();
    }
    const candidate = `${base}-${suffix}`;
    if (await playGameAddressAvailable(ctx, candidate)) {
      await advanceSuffixCursor(ctx, base, suffix + 1);
      return await reserve(ctx, candidate);
    }
  }
  return retryAllocation();
}

/** A supplied name has already passed moderation in its caller; no public creation call accepts it yet. */
export async function allocatePlayGameName(ctx: MutationCtx, suppliedName?: string) {
  let name: string;
  if (suppliedName !== undefined) {
    const parsed = playGameNameSchema.safeParse(suppliedName);
    if (!parsed.success) {
      throw new ConvexError({
        code: 'PLAY_GAME_NAME_INVALID',
        message: parsed.error.issues.map((issue) => issue.message).join(' '),
      });
    }
    name = parsed.data;
  } else {
    name = generatePlayGameName();
    for (let draw = 1; draw < GENERATED_NAME_DRAWS; draw += 1) {
      if (await playGameAddressAvailable(ctx, normalizePlayGameSlug(name))) {
        break;
      }
      name = generatePlayGameName();
    }
  }
  return { name, slug: await allocateSlug(ctx, normalizePlayGameSlug(name)) };
}
