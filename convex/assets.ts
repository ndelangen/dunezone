import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { profileSummary } from './lib/profileSummary';
import type { QueryCtx } from './types';

/**
 * Listing entry for catalogue surfaces.
 * `data` passes through untyped — per-type Zod schemas live with the editors, and listing renderers parse defensively — while `name` is lifted server-side so every surface agrees on the fallback.
 */
const assetListEntryValidator = v.object({
  id: v.id('assets'),
  type: v.string(),
  slug: v.string(),
  name: v.string(),
  created_at: v.string(),
  updated_at: v.string(),
  owner: v.union(
    v.object({
      id: v.id('profiles'),
      slug: v.string(),
      username: v.union(v.string(), v.null()),
      avatar_url: v.union(v.string(), v.null()),
    }),
    v.null()
  ),
  data: v.any(),
});

function nameOf(row: Doc<'assets'>): string {
  const data = row.data as { name?: unknown } | null | undefined;
  return typeof data?.name === 'string' && data.name.trim() ? data.name : 'Untitled';
}

async function toListEntry(ctx: QueryCtx, row: Doc<'assets'>) {
  return {
    id: row._id,
    type: row.type,
    slug: row.slug,
    name: nameOf(row),
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: await profileSummary(ctx, row.owner_id),
    data: row.data,
  };
}

/** Bounds every catalogue read; ordinary use sits far below it. */
const CATALOGUE_SCAN_LIMIT = 1000;
const RECENT_LIMIT = 24;
const PER_TYPE_LIMIT = 200;

/** The `/assets` landing: newest assets across every type, plus per-type counts. */
export const cataloguePage = query({
  args: {},
  returns: v.object({
    recent: v.array(assetListEntryValidator),
    countsByType: v.record(v.string(), v.number()),
  }),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('assets')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .order('desc')
      .take(CATALOGUE_SCAN_LIMIT);

    const countsByType: Record<string, number> = {};
    for (const row of rows) {
      countsByType[row.type] = (countsByType[row.type] ?? 0) + 1;
    }

    const recent = await Promise.all(rows.slice(0, RECENT_LIMIT).map((row) => toListEntry(ctx, row)));
    return { recent, countsByType };
  },
});

/** A category browse page: the caller names the flat Asset types its category derives to. */
export const listByTypes = query({
  args: { types: v.array(v.string()) },
  returns: v.array(assetListEntryValidator),
  handler: async (ctx, args) => {
    const perType = await Promise.all(
      args.types.map((type) =>
        ctx.db
          .query('assets')
          .withIndex('by_type_deleted', (q) => q.eq('type', type).eq('is_deleted', false))
          .order('desc')
          .take(PER_TYPE_LIMIT)
      )
    );
    const rows = perType.flat().sort((a, b) => b._creationTime - a._creationTime);
    return await Promise.all(rows.map((row) => toListEntry(ctx, row)));
  },
});
