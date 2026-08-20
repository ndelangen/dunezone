import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { mutation } from './functions';
import { assertKnownAssetType, parseAssetDataForWrite } from './lib/assetInput';
import {
  loadAssetAccessBundle,
  requireAssetSoftDelete,
  requireAssetUpdate,
  requireGroupReassignment,
} from './lib/collaborativeAccess';
import { assetViewerAccessValidator, assignedGroupSummaryValidator } from './lib/collaborativeAccessValidators';
import { requireAuthUserId } from './lib/policy';
import { profileSummary } from './lib/profileSummary';
import { enqueueAssetPublication } from './lib/publication';
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

/**
 * The edit page's bundle: the asset by type-scoped slug, what the viewer may do with it, and the Groups they could hand it to.
 * `assignableGroups` rides along rather than taking a query of its own, the faction convention, because the toolbar needs it the moment the page renders.
 */
export const getForEdit = query({
  args: { type: v.string(), slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      asset: assetListEntryValidator,
      viewerAccess: assetViewerAccessValidator,
      assignableGroups: v.array(assignedGroupSummaryValidator),
      /** The token serving as this one's backside, for the types that have one. Null covers both "custom back" and "none". */
      backToken: v.union(assetListEntryValidator, v.null()),
      /** A deck's cards with their counts. Empty for every other type. */
      deckCards: v.array(v.object({ card: assetListEntryValidator, count: v.number() })),
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
    const access = await loadAssetAccessBundle(ctx, { kind: 'asset', row });
    const back = TOKEN_TYPES.has(row.type) ? await tokenBackFor(ctx, row._id) : null;
    return {
      asset: await toListEntry(ctx, row),
      viewerAccess: access.viewerAccess,
      assignableGroups: access.assignableGroups,
      backToken: back ? await toListEntry(ctx, back) : null,
      deckCards: row.type === 'deck' ? await deckCardsFor(ctx, row._id) : [],
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
    await enqueueAssetPublication(ctx, { _id: id, type: args.type, slug, data: parsed.data });
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
    await enqueueAssetPublication(ctx, { _id: args.id, type: row.type, slug, data: parsed.data });
    return { id: args.id, slug };
  },
});

/**
 * Retires an Asset without removing it: `is_deleted` is the only column that moves.
 * Every read filters on it, the slug stays reserved by `assertAssetSlugAvailable`, and `asset_relations` rows are deliberately left alone.
 * A deleted card simply stops appearing in the decks that reference it (decision on the assets map: Deck→card reference mechanism and deletion semantics).
 * Idempotent, the faction convention: deleting twice is not an error.
 */
export const softDelete = mutation({
  args: { id: v.id('assets') },
  handler: async (ctx, args) => {
    const access = await requireAssetSoftDelete(ctx, args.id);

    await ctx.db.patch(access.subject._id, {
      is_deleted: true,
      updated_at: nowIso(),
    });
  },
});

/**
 * Hands an Asset to a Group, or takes it back.
 * Owner-only through `changeGroup`, and the target Group must be one the viewer could add a member to, so nobody can park an asset in a Group they do not help run.
 * This is what makes «Asset access reuses Group-associated-asset semantics» reachable: without it `group_id` stays null and collaborative editing never happens.
 */
export const setGroup = mutation({
  args: { id: v.id('assets'), group_id: v.union(v.id('groups'), v.null()) },
  handler: async (ctx, args) => {
    const access = await requireGroupReassignment(ctx, { kind: 'asset', id: args.id }, args.group_id);

    await ctx.db.patch(access.subject._id, {
      group_id: args.group_id,
      updated_at: nowIso(),
    });
  },
});

/** The relation kinds this file writes. Both live in one table, distinguished only by this string. */
const TOKEN_BACK = 'token-back';
const DECK_CARD = 'deck-card';

/** Token Asset types, which are the only things that may sit on either end of a `token-back` relation. */
const TOKEN_TYPES = new Set(['token-round', 'token-gear', 'token-square', 'token-rectangle']);

/**
 * Points a token's backside at another token, or clears the reference.
 *
 * First writer of `asset_relations`, so it establishes the shape deck composition will follow: which types may link is a rule of this mutation rather than of the schema, exactly as «Deck→card reference mechanism and deletion semantics» decided when it chose one table over per-kind tables.
 *
 * `by_from_kind` is a plain index, not unique, so "at most one back per token" is enforced here by clearing what is there before inserting.
 * Nothing in the table would stop a second row.
 */
export const setTokenBack = mutation({
  args: { id: v.id('assets'), back_asset_id: v.union(v.id('assets'), v.null()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get('assets', args.id);
    if (!row || row.is_deleted) {
      throw new Error(`Asset with id ${args.id} not found`);
    }
    if (!TOKEN_TYPES.has(row.type)) {
      throw new Error(`Asset type ${row.type} has no backside`);
    }
    await requireAssetUpdate(ctx, args.id, nameOf(row));

    if (args.back_asset_id !== null) {
      if (args.back_asset_id === args.id) {
        throw new Error('A token cannot be its own backside');
      }
      const back = await ctx.db.get('assets', args.back_asset_id);
      if (!back || back.is_deleted) {
        throw new Error(`Asset with id ${args.back_asset_id} not found`);
      }
      /* Same shape only: the back is the reverse of this physical disc, so a different shape would render clipped. */
      if (back.type !== row.type) {
        throw new Error(`A ${row.type} backside must also be a ${row.type}`);
      }
    }

    const existing = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_kind', (q) => q.eq('from_asset_id', args.id).eq('kind', TOKEN_BACK))
      .take(10);
    for (const relation of existing) {
      await ctx.db.delete(relation._id);
    }
    if (args.back_asset_id !== null) {
      await ctx.db.insert('asset_relations', {
        from_asset_id: args.id,
        to_asset_id: args.back_asset_id,
        kind: TOKEN_BACK,
        count: 1,
      });
    }
    await ctx.db.patch(args.id, { updated_at: nowIso() });
  },
});

/**
 * The token a given token uses as its backside, or null.
 * Filters a soft-deleted target at read time rather than cascading on delete, the rule «Deck→card reference mechanism and deletion semantics» set for every kind in this table.
 */
async function tokenBackFor(ctx: QueryCtx, assetId: Id<'assets'>) {
  const relation = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', assetId).eq('kind', TOKEN_BACK))
    .first();
  if (!relation) {
    return null;
  }
  const back = await ctx.db.get('assets', relation.to_asset_id);
  return back && !back.is_deleted ? back : null;
}

/**
 * Sets how many of a card a deck holds, or removes it at zero.
 *
 * One mutation covers add, change and remove, because "three copies" and "no copies" are the same statement about the same row.
 * Count is the duplicate mechanism «Deck→card reference mechanism and deletion semantics» chose over repeated rows, and there is deliberately no ordering: a deck is shuffled in play.
 */
export const setDeckCardCount = mutation({
  args: { deck_id: v.id('assets'), card_id: v.id('assets'), count: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.count) || args.count < 0 || args.count > 99) {
      throw new Error('A card count must be a whole number between 0 and 99');
    }
    const deck = await ctx.db.get('assets', args.deck_id);
    if (!deck || deck.is_deleted) {
      throw new Error(`Asset with id ${args.deck_id} not found`);
    }
    if (deck.type !== 'deck') {
      throw new Error(`Asset type ${deck.type} holds no cards`);
    }
    await requireAssetUpdate(ctx, args.deck_id, nameOf(deck));

    const card = await ctx.db.get('assets', args.card_id);
    if (!card || card.is_deleted) {
      throw new Error(`Asset with id ${args.card_id} not found`);
    }
    /* Decks hold cards and nothing else. A single table traded schema-level typing for exactly this check. */
    if (!card.type.startsWith('card-')) {
      throw new Error(`A deck holds cards, not ${card.type}`);
    }

    const existing = await ctx.db
      .query('asset_relations')
      .withIndex('by_from_to_kind', (q) =>
        q.eq('from_asset_id', args.deck_id).eq('to_asset_id', args.card_id).eq('kind', DECK_CARD)
      )
      .unique();
    if (args.count === 0) {
      if (existing) {
        await ctx.db.delete(existing._id);
      }
    } else if (existing) {
      await ctx.db.patch(existing._id, { count: args.count });
    } else {
      await ctx.db.insert('asset_relations', {
        from_asset_id: args.deck_id,
        to_asset_id: args.card_id,
        kind: DECK_CARD,
        count: args.count,
      });
    }
    await ctx.db.patch(args.deck_id, { updated_at: nowIso() });
  },
});

/** Bounds a deck's composition read; a deck far below this is the ordinary case. */
const DECK_CARD_LIMIT = 500;

/**
 * A deck's cards with their counts, soft-deleted members filtered out at read time.
 * Editor-scoped: the bulk, many-decks-at-once read the detail and browse pages want is «Build the relation read paths for the asset detail page», which this deliberately does not pre-empt.
 */
async function deckCardsFor(ctx: QueryCtx, deckId: Id<'assets'>) {
  const relations = await ctx.db
    .query('asset_relations')
    .withIndex('by_from_kind', (q) => q.eq('from_asset_id', deckId).eq('kind', DECK_CARD))
    .take(DECK_CARD_LIMIT);
  const entries = [];
  for (const relation of relations) {
    const card = await ctx.db.get('assets', relation.to_asset_id);
    if (card && !card.is_deleted) {
      entries.push({ card: await toListEntry(ctx, card), count: relation.count });
    }
  }
  return entries;
}
