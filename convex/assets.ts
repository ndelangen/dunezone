import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { query } from './_generated/server';
import { mutation } from './functions';
import { assertKnownAssetType, parseAssetDataForWrite } from './lib/assetInput';
import { loadAssetAccessForLoadedSubject, requireAssetUpdate } from './lib/collaborativeAccess';
import { assetViewerAccessValidator } from './lib/collaborativeAccessValidators';
import { requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

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

/** The edit page's bundle: the asset by type-scoped slug, plus what the viewer may do with it. */
export const getForEdit = query({
  args: { type: v.string(), slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      asset: assetListEntryValidator,
      viewerAccess: assetViewerAccessValidator,
    })
  ),
  handler: async (ctx, args) => {
    const holders = await ctx.db
      .query('assets')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .take(50);
    const row = holders.find((candidate) => candidate.type === args.type && !candidate.is_deleted);
    if (!row) {
      return null;
    }
    const access = await loadAssetAccessForLoadedSubject(ctx, row);
    return {
      asset: await toListEntry(ctx, row),
      viewerAccess: access.viewerAccess,
    };
  },
});

/**
 * Slugs are unique per Asset type (see CONTEXT.md) — the slug's job is URL identity and URLs are `/assets/{type}/{slug}` — and a slug once used stays reserved even by soft-deleted assets, the group/faction convention.
 */
async function assertAssetSlugAvailable(ctx: MutationCtx, type: string, slug: string) {
  const holders = await ctx.db
    .query('assets')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .take(50);
  if (holders.some((row) => row.type === type)) {
    throw new Error(`Asset slug ${slug} is reserved for this asset type`);
  }
}

export const create = mutation({
  args: { type: v.string(), data: v.any() },
  returns: v.object({ id: v.id('assets'), slug: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    assertKnownAssetType(args.type);
    const parsed = parseAssetDataForWrite(args.type, args.data);
    const slug = slugify(parsed.name);
    if (!slug) {
      throw new Error('An asset name is required; it determines the asset URL');
    }
    await assertAssetSlugAvailable(ctx, args.type, slug);
    const now = nowIso();
    const id = await ctx.db.insert('assets', {
      owner_id: userId,
      type: args.type,
      data: parsed.data,
      slug,
      created_at: now,
      updated_at: now,
      is_deleted: false,
      group_id: null,
    });
    return { id, slug };
  },
});

export const update = mutation({
  args: { id: v.id('assets'), data: v.any() },
  returns: v.object({ id: v.id('assets'), slug: v.string() }),
  handler: async (ctx, args) => {
    const row = await ctx.db.get('assets', args.id);
    if (!row || row.is_deleted) {
      throw new Error(`Asset with id ${args.id} not found`);
    }
    /* The type is immutable: the stored row decides which schema the incoming data must satisfy. */
    const parsed = parseAssetDataForWrite(row.type, args.data);
    await requireAssetUpdate(ctx, args.id, parsed.name);
    const slug = slugify(parsed.name);
    if (!slug) {
      throw new Error('An asset name is required; it determines the asset URL');
    }
    if (slug !== row.slug) {
      await assertAssetSlugAvailable(ctx, row.type, slug);
    }
    await ctx.db.patch(args.id, { data: parsed.data, slug, updated_at: nowIso() });
    return { id: args.id, slug };
  },
});
