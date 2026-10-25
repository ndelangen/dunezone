import { v } from 'convex/values';

import { RULESET_ASSET_SLOTS } from '../src/shared/rulesets/assetSlots';
import {
  RULESET_CATALOGUE_PAGE_SIZE,
  RULESET_CATALOGUE_QUERY_LIMIT,
  RULESET_CATALOGUE_SORTS,
} from '../src/shared/rulesets/catalogueSearch';
import type { RulesetCatalogueSort } from '../src/shared/rulesets/catalogueSearch';
import { rulesetCoverThumbUrl } from '../src/shared/rulesets/cover';
import { rulesetInputSchema } from '../src/shared/rulesets/validation';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, publicQuery, viewerQuery } from './functions';
import {
  ALL_PARTITION,
  catalogueSearchLimit,
  catalogueSearchReach,
  countCataloguePartitions,
  selectCataloguePage,
  selectCatalogueSearch,
} from './lib/catalogueOrder';
import {
  requireGroupReassignment,
  requireRulesetMaintenance,
  requireRulesetSoftDelete,
  requireRulesetUpdate,
} from './lib/collaborativeAccess';
import { rulesetPageValidator, rulesetPublicDetailPageValidator } from './lib/collaborativeAccessValidators';
import { resolveGroupAssignmentForCreation } from './lib/defaultGroupPreference';
import { catalogueFactionDataValidator } from './lib/factionData';
import { recordFormerSlug } from './lib/formerSlugs';
import {
  buildOwnedForGroupAssignRows,
  OWNED_FOR_GROUP_ASSIGN_LIMIT,
  ownedForGroupAssignRowValidator,
} from './lib/groupAssignPicker';
import { requireAuthUserId } from './lib/policy';
import { rulesetCatalogueOrderOf } from './lib/rulesetCatalogue';
import {
  listOrderedRulesetFactions,
  loadRulesetPageBySlug,
  RULESET_FACTION_LIMIT,
  loadRulesetPublicDetailPageBySlug,
} from './lib/rulesetDetailPage';
import { SLOT_CONTENTS_LIMIT } from './lib/rulesetSlots';
import { allocateCounterSlug } from './lib/slugCounters';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

async function getRulesetById(ctx: QueryCtx | MutationCtx, id: Id<'rulesets'>) {
  return await ctx.db.get(id);
}

/**
 * The patch an update writes.
 * `image_cover` keeps the absent-means-untouched rule, since clearing a cover is expressed as `null`;
 * name and About are required of every write, so they are always part of the patch.
 * An explicit `image_cover` also clears the stored `cover`: this legacy channel is how a pre-rehost bundle expresses a cover intent, and `rulesetCovers.rehost` is the only writer that sets `cover`.
 * The shape is inferred rather than restated, so adding a field here cannot drift from the type that describes it.
 */
function rulesetUpdatePatch(fields: { name: string; slug: string; about: string; image_cover?: string | null }) {
  return {
    name: fields.name,
    slug: fields.slug,
    about: fields.about,
    updated_at: nowIso(),
    ...(fields.image_cover === undefined ? {} : { image_cover: fields.image_cover, cover: null }),
  };
}

function parseRulesetInput(input: { name: string; about: string }) {
  const parsed = rulesetInputSchema.safeParse({ name: input.name, about: input.about });
  if (!parsed.success) {
    const msg = parsed.error.issues.map((issue) => issue.message).join(' ');
    throw new Error(msg || 'Invalid ruleset input');
  }
  return parsed.data;
}

async function resolveUniqueRulesetSlug(ctx: MutationCtx, name: string, own?: Doc<'rulesets'>) {
  const base = slugify(name) || 'ruleset';
  if (own && (slugify(own.name) || 'ruleset') === base) {
    return own.slug;
  }
  return await allocateCounterSlug(ctx, `ruleset-slug:${JSON.stringify([base])}`, base, async (slug) => {
    if (slug === 'create') {
      return false;
    }
    const existing = await ctx.db
      .query('rulesets')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    return !existing || existing._id === own?._id;
  });
}

const rulesetCatalogueEntryValidator = v.object({
  id: v.id('rulesets'),
  slug: v.string(),
  name: v.string(),
  /** The grid's cover rendition, or null for a ruleset without a cover. */
  coverThumbUrl: v.union(v.string(), v.null()),
});

/** The tiles of the selected entries, each ruleset read once. */
async function catalogueEntries(ctx: QueryCtx, selected: { source_id: string }[]) {
  const entries = [];
  for (const entry of selected) {
    const rulesetId = ctx.db.normalizeId('rulesets', entry.source_id);
    const ruleset = rulesetId ? await ctx.db.get('rulesets', rulesetId) : null;
    if (!ruleset || ruleset.is_deleted) {
      /* Drift: the page comes up one tile short until the backfill or the ruleset's next save. */
      console.warn(`Catalogue entry for ruleset ${entry.source_id} has no live ruleset.`);
      continue;
    }
    entries.push({
      id: ruleset._id,
      slug: ruleset.slug,
      name: ruleset.name,
      coverThumbUrl: rulesetCoverThumbUrl(ruleset),
    });
  }
  return entries;
}

/** A browsed page: aggregate counts, numbered pages, a chosen order. */
const catalogueBrowseValidator = v.object({
  entries: v.array(rulesetCatalogueEntryValidator),
  /** Rulesets across every page. */
  total: v.number(),
  /** Listed rulesets, before any search; the same as `total` while browsing. */
  rulesetTotal: v.number(),
  /** Always true while browsing, since the aggregate counts exactly; kept so the pager reads one shape across the catalogues. */
  complete: v.boolean(),
  /** The page these tiles are, which may lie past `pageCount`, with no tiles. */
  page: v.number(),
  pageCount: v.number(),
  pageSize: v.number(),
});

/** A searched catalogue: the best matches first, no count and no pages, and more by asking for a larger limit. */
const catalogueSearchValidator = v.object({
  mode: v.literal('search'),
  entries: v.array(rulesetCatalogueEntryValidator),
  /** Whether a larger limit would show more rulesets. */
  hasMore: v.boolean(),
  /** Whether more rulesets may match than one search shows, so the reader should add a word rather than load more. */
  capped: v.boolean(),
  /** The limit these tiles answer, after clamping. */
  limit: v.number(),
  /** Listed rulesets, before any search. */
  rulesetTotal: v.number(),
});

type CatalogueArgs = { q?: string; sort?: RulesetCatalogueSort; page?: number; limit?: number };

async function loadCataloguePage(ctx: QueryCtx, args: CatalogueArgs) {
  const page = Number.isSafeInteger(args.page) && args.page! > 1 ? args.page! : 1;
  const selection = await selectCataloguePage(ctx, {
    kind: 'ruleset',
    partition: ALL_PARTITION,
    ...rulesetCatalogueOrderOf(args.sort),
    page,
    pageSize: RULESET_CATALOGUE_PAGE_SIZE,
  });
  return {
    entries: await catalogueEntries(ctx, selection.entries),
    total: selection.total,
    rulesetTotal: selection.total,
    complete: selection.exact,
    page,
    pageCount: Math.max(1, Math.ceil(selection.total / RULESET_CATALOGUE_PAGE_SIZE)),
    pageSize: RULESET_CATALOGUE_PAGE_SIZE,
  };
}

async function loadCatalogueSearch(ctx: QueryCtx, args: CatalogueArgs, text: string) {
  const limit = catalogueSearchLimit(args.limit, RULESET_CATALOGUE_PAGE_SIZE);
  const [selection, [rulesetTotal = 0]] = await Promise.all([
    selectCatalogueSearch(ctx, { kind: 'ruleset', partition: ALL_PARTITION, text, limit }),
    countCataloguePartitions(ctx, 'ruleset', [ALL_PARTITION]),
  ]);
  return {
    mode: 'search' as const,
    entries: await catalogueEntries(ctx, selection.entries),
    ...catalogueSearchReach(selection, limit, RULESET_CATALOGUE_PAGE_SIZE),
    limit,
    rulesetTotal,
  };
}

/**
 * The ruleset catalogue, the same for every viewer: the aggregate counts it and finds a page's first ruleset;
 * a search uses Convex's search index over the names, best matches first, and loads more by asking again with a larger `limit`.
 * Only the page's own rulesets are read, so a page costs the same however many rulesets there are.
 */
export const catalogue = publicQuery({
  args: {
    q: v.optional(v.string()),
    sort: v.optional(v.union(...RULESET_CATALOGUE_SORTS.map((sort) => v.literal(sort)))),
    page: v.optional(v.number()),
    /** How many of the best matches to return; Load more asks again with a larger one. */
    limit: v.optional(v.number()),
  },
  returns: v.union(catalogueBrowseValidator, catalogueSearchValidator),
  handler: async (ctx, args) => {
    const text = args.q?.slice(0, RULESET_CATALOGUE_QUERY_LIMIT).trim() ?? '';
    return text ? await loadCatalogueSearch(ctx, args, text) : await loadCataloguePage(ctx, args);
  },
});

export const get = publicQuery({
  args: { id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const row = await getRulesetById(ctx, args.id);
    if (!row || row.is_deleted) {
      throw new Error(`Ruleset with id ${args.id} not found`);
    }
    return row;
  },
});

/** The ruleset and its factions, one cached answer for every viewer. */
export const page = publicQuery({
  args: { slug: v.string() },
  returns: rulesetPageValidator,
  handler: async (ctx, args) => await loadRulesetPageBySlug(ctx, args.slug),
});

/**
 * The ruleset detail page, one cached answer for every viewer.
 * The browser combines `ruleset.owner_id` and `assignedGroup` with the viewer to decide what they may do.
 */
export const detailPage = publicQuery({
  args: { slug: v.string() },
  returns: rulesetPublicDetailPageValidator,
  handler: async (ctx, args) => await loadRulesetPublicDetailPageBySlug(ctx, args.slug),
});

/** A ruleset's first live factions in its own order, one cached answer for every viewer: the edit page's list, which loads more by asking for more. */
export const orderedFactions = publicQuery({
  args: { rulesetId: v.id('rulesets'), limit: v.number() },
  returns: v.object({
    factions: v.array(
      v.object({
        _id: v.id('factions'),
        slug: v.string(),
        name: v.string(),
        /** Enough to draw the faction's token beside its name. */
        logo: catalogueFactionDataValidator.fields.logo,
        background: catalogueFactionDataValidator.fields.background,
      })
    ),
    /** True when links remain past `limit`, which a larger limit loads. */
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => await listOrderedRulesetFactions(ctx, args.rulesetId, args.limit),
});

/**
 * Rulesets the viewer owns, with their current group's name resolved, for the group-detail "add my ruleset to this group" picker.
 */
export const listOwnedForGroupAssign = viewerQuery({
  args: {},
  returns: v.array(ownedForGroupAssignRowValidator('rulesets')),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const rows = await ctx.db
      .query('rulesets')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', false))
      .take(OWNED_FOR_GROUP_ASSIGN_LIMIT);
    return await buildOwnedForGroupAssignRows(ctx, rows, (row) => row.name);
  },
});

export const listByFaction = publicQuery({
  args: { faction_id: v.id('factions') },
  handler: async (ctx, args) => {
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_faction', (q) => q.eq('faction_id', args.faction_id))
      .take(500);
    const rulesets = await Promise.all(links.map((link) => getRulesetById(ctx, link.ruleset_id)));
    return rulesets.filter((row): row is NonNullable<typeof row> => row != null && !row.is_deleted);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    about: v.string(),
    group_id: v.optional(v.union(v.id('groups'), v.null())),
    image_cover: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const input = parseRulesetInput(args);
    const normalizedName = input.name;

    const groupAssignment = await resolveGroupAssignmentForCreation(ctx, userId, args.group_id);

    const duplicate = await ctx.db
      .query('rulesets')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .take(25);
    if (duplicate.some((row) => !row.is_deleted)) {
      throw new Error('Ruleset name already exists');
    }

    const now = nowIso();
    const slug = await resolveUniqueRulesetSlug(ctx, normalizedName);
    const _id = await ctx.db.insert('rulesets', {
      name: normalizedName,
      about: input.about,
      slug,
      owner_id: userId,
      group_id: groupAssignment.group_id,
      image_cover: args.image_cover,
      cover: null,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    const created = await ctx.db.get(_id);
    if (!created) {
      throw new Error('Failed to create ruleset');
    }
    return { ...created, route_notice: groupAssignment.route_notice };
  },
});

export const update = mutation({
  args: {
    id: v.id('rulesets'),
    name: v.string(),
    about: v.string(),
    image_cover: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const input = parseRulesetInput(args);
    const normalizedName = input.name;
    const access = await requireRulesetUpdate(ctx, args.id, { name: normalizedName });
    const ruleset = access.subject;

    const duplicate = await ctx.db
      .query('rulesets')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .take(25);
    if (duplicate.some((row) => row._id !== args.id && !row.is_deleted)) {
      throw new Error('Ruleset name already exists');
    }

    /*
     * A pre-rehost bundle echoes the dual-written delivery URL back on every save.
     * That echo is not a new cover intent, so it must not clear the stored cover and lose its provenance.
     */
    const imageCoverIntent =
      typeof args.image_cover === 'string' && args.image_cover === ruleset.cover?.url ? undefined : args.image_cover;
    const slug = await resolveUniqueRulesetSlug(ctx, normalizedName, ruleset);
    if (slug !== ruleset.slug) {
      await recordFormerSlug(ctx, { kind: 'ruleset', scope: '', slug: ruleset.slug, record_id: ruleset._id });
    }
    await ctx.db.patch(
      ruleset._id,
      rulesetUpdatePatch({
        name: normalizedName,
        slug,
        about: input.about,
        image_cover: imageCoverIntent,
      })
    );
    const updated = await ctx.db.get(ruleset._id);
    if (!updated) {
      throw new Error('Failed to update ruleset');
    }
    return updated;
  },
});

/**
 * Moves a ruleset between maintaining groups, or clears its assignment with `null`.
 * Separate from `update` on purpose: assigning a group is the owner's `changeGroup` capability rather than the content edit any active member may make, and a caller here cannot express a name or About at all, so moving a group can never overwrite either.
 * `factions.setGroup` is the same shape.
 */
export const setGroup = mutation({
  args: {
    id: v.id('rulesets'),
    group_id: v.union(v.id('groups'), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await requireGroupReassignment(
      ctx,
      { kind: 'ruleset', id: args.id },
      args.group_id,
      'Only the ruleset owner can change its group'
    );

    await ctx.db.patch(access.subject._id, {
      group_id: args.group_id,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(access.subject._id);
    if (!updated) {
      throw new Error('Failed to update ruleset group');
    }
    return updated;
  },
});

export const softDelete = mutation({
  args: { id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const { subject: ruleset } = await requireRulesetSoftDelete(ctx, args.id);

    await ctx.db.patch(ruleset._id, {
      is_deleted: true,
      updated_at: nowIso(),
    });
  },
});

export const addFaction = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    faction_id: v.id('factions'),
  },
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);

    const faction = await ctx.db.get('factions', args.faction_id);
    if (!faction || faction.is_deleted) {
      throw new Error('Faction not found');
    }

    const existing = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_faction', (q) => q.eq('ruleset_id', args.ruleset_id).eq('faction_id', args.faction_id))
      .unique();
    if (!existing) {
      const links = await ctx.db
        .query('ruleset_factions')
        .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', args.ruleset_id))
        .take(RULESET_FACTION_LIMIT);
      if (links.length === RULESET_FACTION_LIMIT) {
        throw new Error(`A ruleset holds at most ${RULESET_FACTION_LIMIT} factions.`);
      }
      /* Appended: a reorder numbers from 0 and every earlier append was made sooner, so now is past them all. */
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: args.ruleset_id,
        faction_id: args.faction_id,
        position: Date.now(),
      });
    }
    return args;
  },
});

/**
 * Puts a ruleset's factions in the order given.
 * The list can be stale, as someone may have added or removed a faction meanwhile: an id no longer linked is ignored, and a link the list leaves out keeps its place relative to the others, after the ones it names.
 * Only the links whose place changed are written.
 */
export const reorderFactions = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    faction_ids: v.array(v.id('factions')),
  },
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);
    if (args.faction_ids.length > RULESET_FACTION_LIMIT) {
      throw new Error(`A ruleset's order holds at most ${RULESET_FACTION_LIMIT} factions.`);
    }
    const links = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_position', (q) => q.eq('ruleset_id', args.ruleset_id))
      .take(RULESET_FACTION_LIMIT);
    const linkByFaction = new Map(links.map((link) => [link.faction_id, link]));
    const named = [...new Set(args.faction_ids)].flatMap((factionId) => linkByFaction.get(factionId) ?? []);
    const namedIds = new Set(named.map((link) => link._id));
    const ordered = [...named, ...links.filter((link) => !namedIds.has(link._id))];
    for (const [position, link] of ordered.entries()) {
      if (link.position !== position) {
        await ctx.db.patch('ruleset_factions', link._id, { position });
      }
    }
    return null;
  },
});

export const removeFaction = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    faction_id: v.id('factions'),
  },
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);

    const existing = await ctx.db
      .query('ruleset_factions')
      .withIndex('by_ruleset_faction', (q) => q.eq('ruleset_id', args.ruleset_id).eq('faction_id', args.faction_id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return args;
  },
});

/**
 * The slot vocabulary as Convex sees it.
 * `ruleset_asset_slots` declares the same slot literals and cannot import the shared table without ceasing to be a schema, so a drift test holds the two together.
 */
const assetSlotValidator = v.union(
  v.literal('board'),
  v.literal('treachery'),
  v.literal('spice'),
  v.literal('custom'),
  v.literal('techToken'),
  v.literal('customTokens')
);

/**
 * Puts an asset in a slot.
 *
 * Which kind a slot accepts is enforced here rather than by the schema, per «Ruleset slot table generalises to assets»: a `kind` column would be a second source of truth able to disagree with `slot`.
 * At-most-one is enforced by clearing before inserting, because `by_ruleset_slot` is a plain index and nothing in the table would stop a second row.
 * Clear-before-insert is the at-most-one shape the `asset_relations` writers settled on.
 * Idempotent, like `addFaction`: linking what is already linked is a no-op rather than a duplicate row.
 */
export const setAssetSlot = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    asset_id: v.id('assets'),
    slot: assetSlotValidator,
  },
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);

    const rule = RULESET_ASSET_SLOTS[args.slot];
    const asset = await ctx.db.get('assets', args.asset_id);
    if (!asset || asset.is_deleted) {
      throw new Error('Asset not found');
    }
    if (asset.type !== rule.holds) {
      throw new Error(`The ${rule.label} slot holds ${rule.noun}, not ${asset.type}`);
    }

    const existing = await ctx.db
      .query('ruleset_asset_slots')
      .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', args.ruleset_id).eq('slot', args.slot))
      .take(SLOT_CONTENTS_LIMIT);
    if (existing.some((row) => row.asset_id === args.asset_id)) {
      return args;
    }
    /* The read window is the slot's stated capacity, not a sample of it. Without the ceiling, a slot past the window would take duplicates and clear partially, silently. */
    if (!rule.single && existing.length >= SLOT_CONTENTS_LIMIT) {
      throw new Error(`The ${rule.label} slot is full`);
    }
    if (rule.single) {
      for (const row of existing) {
        await ctx.db.delete(row._id);
      }
    }

    await ctx.db.insert('ruleset_asset_slots', {
      ruleset_id: args.ruleset_id,
      asset_id: args.asset_id,
      slot: args.slot,
    });
    return args;
  },
});

/**
 * Takes an asset out of a slot.
 * Idempotent for the same reason as `removeFaction`: clearing what is already clear is a no-op, so a double click cannot fail.
 */
export const clearAssetSlot = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    asset_id: v.id('assets'),
    slot: assetSlotValidator,
  },
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);

    const existing = await ctx.db
      .query('ruleset_asset_slots')
      .withIndex('by_ruleset_slot', (q) => q.eq('ruleset_id', args.ruleset_id).eq('slot', args.slot))
      .take(SLOT_CONTENTS_LIMIT);
    for (const row of existing.filter((candidate) => candidate.asset_id === args.asset_id)) {
      await ctx.db.delete(row._id);
    }
    return args;
  },
});
