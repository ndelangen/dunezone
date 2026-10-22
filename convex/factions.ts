import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { FACTION_CATALOGUE_QUERY_LIMIT, FACTION_CATALOGUE_SORTS } from '../src/shared/factions/catalogueSearch';
import { factionExtraKey, storedFactionExtrasSchema } from '../src/shared/factions/extras';
import type { FactionExtra } from '../src/shared/factions/extras';
import type { Doc, Id } from './_generated/dataModel';
import { publicationStatusFor } from './assetPublishingStatus';
import { liveAsset } from './assets';
import { mutation, publicQuery, viewerQuery } from './functions';
import { isActiveProfile } from './lib/accountLifecycle';
import { backgroundProjection } from './lib/backgroundPresets';
import { listCardFrontPresets } from './lib/cardFrontPresets';
import {
  assignedGroupSummary,
  liveGroupOrNull,
  requireFactionSoftDelete,
  requireFactionUpdate,
  requireGroupReassignment,
} from './lib/collaborativeAccess';
import { relatedFaqItemValidator } from './lib/collaborativeAccessValidators';
import {
  factionDetailPageValidator,
  factionValidator,
  catalogueFactionValidator,
  rulesetSummaryValidator,
} from './lib/collaborativeAccessValidators';
import { resolveGroupAssignmentForCreation } from './lib/defaultGroupPreference';
import { listFactionRulesets } from './lib/factionCatalogue';
import {
  loadFactionCatalogue,
  loadFactionCataloguePage,
  loadFactionCatalogueSearch,
  selectFactionCatalogueSpotlights,
} from './lib/factionCatalogue';
import { factionDataValidator } from './lib/factionData';
import {
  factionInputForWrite,
  factionRowForClient,
  parseFactionInput,
  parseStoredFactionForRead,
} from './lib/factionInput';
import { loadRelatedFaqPage } from './lib/faqReferences';
import { recordFormerSlug } from './lib/formerSlugs';
import {
  buildOwnedForGroupAssignRows,
  OWNED_FOR_GROUP_ASSIGN_LIMIT,
  ownedForGroupAssignRowValidator,
} from './lib/groupAssignPicker';
import { requireAuthUserId } from './lib/policy';
import {
  enqueueFactionLeaderPublications,
  enqueueFactionSheetPublication,
  enqueueFactionTokenPublication,
  enqueueFactionFaces,
} from './lib/publication';
import { allocateCounterSlug } from './lib/slugCounters';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

/**
 * Who holds this address: a living faction, a soft-deleted one whose slug stays reserved, or nobody.
 * `exceptId` is the faction doing the asking, so renaming a faction never trips over its own address.
 */
async function factionSlugHolder(
  ctx: QueryCtx,
  slug: string,
  exceptId?: Id<'factions'>
): Promise<'live' | 'deleted' | null> {
  const existing = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!existing || existing._id === exceptId) {
    return null;
  }
  return existing.is_deleted ? 'deleted' : 'live';
}

/** Retained for older browser bundles and the Storybook seat resolver; new editors allow repeated names. */
export const slugTaken = publicQuery({
  args: { slug: v.string() },
  returns: v.union(v.literal('live'), v.literal('deleted'), v.null()),
  handler: async (ctx, args) => (args.slug === 'create' ? null : await factionSlugHolder(ctx, args.slug)),
});

async function resolveFactionSlug(ctx: MutationCtx, name: string, own?: Doc<'factions'>) {
  const base = slugify(name);
  /* Keep existing suffixes on ordinary saves, including after the plain address becomes free. */
  if (own && slugify(own.data.name) === base && own.slug !== 'create') {
    return own.slug;
  }
  return await allocateCounterSlug(ctx, `faction-slug:${JSON.stringify([base])}`, base, async (slug) => {
    if (slug === 'create') {
      return false;
    }
    return (await factionSlugHolder(ctx, slug, own?._id)) === null;
  });
}

function factionDataForClient(data: unknown) {
  return parseStoredFactionForRead(data);
}

/** The faction row a page is for: live, or NOT_FOUND. */
async function liveFactionBySlug(ctx: QueryCtx, slug: string) {
  const row = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!row || row.is_deleted) {
    throw new ConvexError({ code: 'NOT_FOUND', message: `Faction with slug ${slug} not found` });
  }
  return row;
}

/** Faction detail page bundle (view, edit, and sheet preview): the same for every viewer. */
async function loadFactionDetailPage(ctx: QueryCtx, row: Doc<'factions'>) {
  const ownerProfile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', row.owner_id))
    .unique();
  if (!ownerProfile) {
    throw new Error(`Profile with user id ${row.owner_id} not found`);
  }

  return {
    backgrounds: await backgroundProjection(ctx, row.data),
    cardFrontPresets: await listCardFrontPresets(ctx),
    faction: {
      ...row,
      data: factionDataForClient(row.data),
    },
    owner: isActiveProfile(ownerProfile) ? ownerProfile : null,
    assetPublishing: await publicationStatusFor(ctx, 'faction_sheet', row._id),
    assignedGroup: await assignedGroupSummary(ctx, row.group_id),
    rulesets: await listFactionRulesets(ctx, row._id),
  };
}

/**
 * The faction page, one cached answer for every viewer.
 * The browser combines `faction.owner_id` and `assignedGroup` with the viewer to decide what they may do.
 */
export const pageBySlug = publicQuery({
  args: { slug: v.string() },
  returns: factionDetailPageValidator,
  handler: async (ctx, args) => loadFactionDetailPage(ctx, await liveFactionBySlug(ctx, args.slug)),
});

export const detailPage = publicQuery({
  args: { slug: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ detail: v.union(factionDetailPageValidator, v.null()), items: v.array(relatedFaqItemValidator) })
  ),
  handler: async (ctx, args) => {
    const row = await liveFactionBySlug(ctx, args.slug);
    const related = await loadRelatedFaqPage(ctx, { kind: 'faction', id: row._id }, args.paginationOpts);
    const detail = args.paginationOpts.cursor === null ? await loadFactionDetailPage(ctx, row) : null;
    return { ...related, page: [{ detail, items: related.page }] };
  },
});

/**
 * A live faction's page address by its id, for Play, whose seats carry only the id.
 * The game shows the faction as it captured it, and reads only the address live, since renaming a faction moves its page.
 * Null for an unknown or deleted faction, so a game table never fails on it.
 */
export const pageSlug = publicQuery({
  args: { id: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId('factions', args.id);
    const row = id ? await ctx.db.get('factions', id) : null;
    return row && !row.is_deleted ? row.slug : null;
  },
});

export const list = publicQuery({
  args: {},
  returns: v.array(factionValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(500);
    return rows.map(factionRowForClient);
  },
});

/**
 * The unpaged catalogue bundle, superseded by `catalogue`.
 * Deleting a public query is expand/contract: this goes in the release after the one that moves the route off it.
 */
export const cataloguePage = publicQuery({
  args: {},
  returns: v.object({
    factions: v.array(catalogueFactionValidator),
    rulesets: v.array(rulesetSummaryValidator),
    spotlights: v.object({
      newArrival: v.union(catalogueFactionValidator, v.null()),
      freshlyUpdated: v.union(catalogueFactionValidator, v.null()),
    }),
  }),
  handler: async (ctx) => {
    const { factions, rulesets } = await loadFactionCatalogue(ctx);

    return {
      factions,
      rulesets,
      spotlights: selectFactionCatalogueSpotlights(factions),
    };
  },
});

const catalogueSortValidator = v.union(...FACTION_CATALOGUE_SORTS.map((sort) => v.literal(sort)));

const catalogueSpotlightsValidator = v.object({
  newArrival: v.union(catalogueFactionValidator, v.null()),
  freshlyUpdated: v.union(catalogueFactionValidator, v.null()),
});

const catalogueRulesetsValidator = v.array(rulesetSummaryValidator.extend({ factionCount: v.number() }));

/** A browsed page: aggregate counts, numbered pages, a chosen order. */
const catalogueBrowseValidator = v.object({
  cards: v.array(catalogueFactionValidator),
  /** Factions matching the filters, across every page. */
  total: v.number(),
  /** Live factions in the catalogue, before any search or filter. */
  catalogueTotal: v.number(),
  /** False once the catalogue outgrows the entries one query reads; totals and the last pages are then short. */
  complete: v.boolean(),
  /** The page these cards are, which may lie past `pageCount`, with no cards. */
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
  rulesets: catalogueRulesetsValidator,
  spotlights: catalogueSpotlightsValidator,
});

/** A searched catalogue: the best matches first, no count and no pages, and more by asking for a larger limit. */
const catalogueSearchValidator = v.object({
  mode: v.literal('search'),
  cards: v.array(catalogueFactionValidator),
  /** Whether a larger limit would show more factions. */
  hasMore: v.boolean(),
  /** Whether more factions may match than one search shows, so the reader should add a word rather than load more. */
  capped: v.boolean(),
  /** The limit these cards answer, after clamping. */
  limit: v.number(),
  /** Live factions in the catalogue, before any search or filter. */
  catalogueTotal: v.number(),
  rulesets: catalogueRulesetsValidator,
  spotlights: catalogueSpotlightsValidator,
});

/**
 * The Faction catalogue, the same for every viewer: the route's search parameters in, the visible cards and the counts out.
 * A search is the load-more search, best matches first up to `limit`;
 * without one the catalogue is browsed, in pages.
 * Replaces `cataloguePage`, which stays for one release so a bundle still asking for it keeps working while this one deploys.
 */
export const catalogue = publicQuery({
  args: {
    q: v.optional(v.string()),
    ruleset: v.optional(v.string()),
    complexity: v.optional(v.string()),
    sort: v.optional(catalogueSortValidator),
    page: v.optional(v.number()),
    /** How many of the best matches to return; Load more asks again with a larger one. */
    limit: v.optional(v.number()),
  },
  returns: v.union(catalogueBrowseValidator, catalogueSearchValidator),
  handler: async (ctx, args) =>
    /* Gated on the text the search runs, so a query that is blank once cut to length browses instead. */
    args.q?.slice(0, FACTION_CATALOGUE_QUERY_LIMIT).trim()
      ? await loadFactionCatalogueSearch(ctx, args)
      : await loadFactionCataloguePage(ctx, args),
});

/** Factions + resolved group/owner labels and the caller's group memberships for the load picker. */
const loadPickerRowValidator = v.object({
  id: v.id('factions'),
  slug: v.string(),
  data: factionDataValidator,
  groupId: v.union(v.id('groups'), v.null()),
  groupLabel: v.string(),
  ownerId: v.id('users'),
  ownerUsername: v.union(v.string(), v.null()),
});

export const listForLoadPicker = viewerQuery({
  args: {},
  returns: v.object({
    rows: v.array(loadPickerRowValidator),
    memberGroupIds: v.array(v.id('groups')),
  }),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);

    const factionRows = await ctx.db
      .query('factions')
      .withIndex('by_deleted', (q) => q.eq('is_deleted', false))
      .take(500);

    const memberships = await ctx.db
      .query('group_members')
      .withIndex('by_user_status', (q) => q.eq('user_id', userId).eq('status', 'active'))
      .take(500);
    const groupIds = new Set<Id<'groups'>>(memberships.map((m) => m.group_id));
    for (const row of factionRows) {
      if (row.group_id) {
        groupIds.add(row.group_id);
      }
    }
    /* A deleted Group names nothing and reaches no one, as everywhere else (ADR-0003). */
    const groupNameById = new Map<string, string>();
    for (const gid of groupIds) {
      const group = liveGroupOrNull(await ctx.db.get('groups', gid));
      if (group) {
        groupNameById.set(gid, group.name.trim());
      }
    }
    const memberGroupIds = [...new Set(memberships.map((m) => m.group_id))].filter((gid) => groupNameById.has(gid));

    const ownerIds = [...new Set(factionRows.map((row) => row.owner_id))];
    const ownerUsernameById = new Map<string, string | null>();
    for (const oid of ownerIds) {
      const profile = await ctx.db
        .query('profiles')
        .withIndex('by_user_id', (q) => q.eq('user_id', oid))
        .unique();
      ownerUsernameById.set(oid, profile?.username ?? null);
    }

    const rows = factionRows.map((row) => {
      const data = factionDataForClient(row.data);
      const groupId = row.group_id && groupNameById.has(row.group_id) ? row.group_id : null;
      const groupLabel = groupId ? groupNameById.get(groupId)! : 'No group';
      return {
        id: row._id,
        slug: row.slug,
        data,
        groupId,
        groupLabel,
        ownerId: row.owner_id,
        ownerUsername: ownerUsernameById.get(row.owner_id) ?? null,
      };
    });

    return { rows, memberGroupIds };
  },
});

export const listByOwner = publicQuery({
  args: {
    owner_id: v.id('users'),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', args.owner_id).eq('is_deleted', false))
      .take(500);
    return rows.map(factionRowForClient);
  },
});

/**
 * Factions the viewer owns, with their current group's name resolved, for the group-detail "add my faction to this group" picker.
 */
export const listOwnedForGroupAssign = viewerQuery({
  args: {},
  returns: v.array(ownedForGroupAssignRowValidator('factions')),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', false))
      .take(OWNED_FOR_GROUP_ASSIGN_LIMIT);
    return await buildOwnedForGroupAssignRows(ctx, rows, (row) => factionDataForClient(row.data).name);
  },
});

export const listByGroup = publicQuery({
  args: {
    group_id: v.id('groups'),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_group_deleted', (q) => q.eq('group_id', args.group_id).eq('is_deleted', false))
      .take(500);
    return rows.map(factionRowForClient);
  },
});

/**
 * The Extras a stored faction already lists;
 * retired link lists read as absent, and anything else unreadable counts as none, so it cannot excuse a new reference.
 */
function savedFactionExtras(data: unknown): FactionExtra[] {
  const parsed = storedFactionExtrasSchema.safeParse((data as { extras?: unknown } | null)?.extras ?? []);
  return parsed.success ? parsed.data : [];
}

/**
 * Each Extra the author adds must name a live catalogue asset of its type.
 * One the faction already listed is kept even after its asset is removed, so unrelated edits still save;
 * Play names it as not ready until the author fixes or removes it.
 */
async function assertAddedFactionExtrasExist(
  ctx: MutationCtx,
  extras: readonly FactionExtra[] | undefined,
  saved: readonly FactionExtra[]
) {
  const kept = new Set(saved.map(factionExtraKey));
  const added = (extras ?? []).filter((extra) => !kept.has(factionExtraKey(extra)));
  const assets = await Promise.all(added.map((extra) => liveAsset(ctx, extra.type, extra.slug)));
  const missing = added.find((_, index) => !assets[index]);
  if (missing) {
    throw new ConvexError(
      `The Extra ${factionExtraKey(missing)} is not in the catalogue. Choose it again or remove it.`
    );
  }
}

export const create = mutation({
  args: {
    data: v.any(),
    group_id: v.optional(v.union(v.id('groups'), v.null())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const groupAssignment = await resolveGroupAssignmentForCreation(ctx, userId, args.group_id);

    const data = factionInputForWrite(args.data);
    await assertAddedFactionExtrasExist(ctx, data.extras, []);
    const slug = await resolveFactionSlug(ctx, data.name);

    const now = nowIso();
    const _id = await ctx.db.insert('factions', {
      owner_id: userId,
      data,
      slug,
      group_id: groupAssignment.group_id,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    const row = await ctx.db.get(_id);
    if (!row) {
      throw new Error('Failed to create faction');
    }
    await enqueueFactionSheetPublication(ctx, row);
    await enqueueFactionTokenPublication(ctx, row);
    await enqueueFactionLeaderPublications(ctx, row);
    await enqueueFactionFaces(ctx, row);
    return { ...factionRowForClient(row), route_notice: groupAssignment.route_notice };
  },
});

export const update = mutation({
  args: {
    id: v.id('factions'),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const data = parseFactionInput(args.data, {
      requireAuthoringSemantics: true,
    });
    const access = await requireFactionUpdate(ctx, args.id, data);
    const identifiedData = factionInputForWrite(data, access.subject.data);
    await assertAddedFactionExtrasExist(ctx, data.extras, savedFactionExtras(access.subject.data));
    const slug = await resolveFactionSlug(ctx, data.name, access.subject);
    if (slug !== access.subject.slug) {
      await recordFormerSlug(ctx, {
        kind: 'faction',
        scope: '',
        slug: access.subject.slug,
        record_id: access.subject._id,
      });
    }

    await ctx.db.patch(access.subject._id, {
      data: identifiedData,
      slug,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(access.subject._id);
    if (!updated) {
      throw new Error('Failed to update faction');
    }
    await enqueueFactionSheetPublication(ctx, updated);
    await enqueueFactionTokenPublication(ctx, updated, access.subject.data);
    await enqueueFactionLeaderPublications(ctx, updated, access.subject.data);
    await enqueueFactionFaces(ctx, updated, access.subject.data);
    return factionRowForClient(updated);
  },
});

export const setGroup = mutation({
  args: {
    id: v.id('factions'),
    group_id: v.union(v.id('groups'), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await requireGroupReassignment(ctx, { kind: 'faction', id: args.id }, args.group_id);

    await ctx.db.patch(args.id, {
      group_id: args.group_id,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(access.subject._id);
    if (!updated) {
      throw new Error('Failed to update faction group');
    }
    return factionRowForClient(updated);
  },
});

export const softDelete = mutation({
  args: { id: v.id('factions') },
  handler: async (ctx, args) => {
    const access = await requireFactionSoftDelete(ctx, args.id);

    await ctx.db.patch(access.subject._id, {
      is_deleted: true,
      updated_at: nowIso(),
    });
  },
});
