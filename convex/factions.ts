import { v } from 'convex/values';

import { CanonicalFactionStoredSchema } from '../src/game/schema/faction';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { factionSheetPublishingStatus } from './assetPublishingStatus';
import { mutation } from './functions';
import {
  loadAssetAccessBundle,
  requireAssignableGroup,
  requireFactionSoftDelete,
  requireFactionUpdate,
  requireGroupReassignment,
} from './lib/collaborativeAccess';
import {
  factionDetailPageValidator,
  factionValidator,
  factionWithRulesetsValidator,
  rulesetSummaryValidator,
} from './lib/collaborativeAccessValidators';
import { loadFactionCatalogue, selectFactionCatalogueSpotlights } from './lib/factionCatalogue';
import { factionDataValidator } from './lib/factionData';
import { parseFactionInput } from './lib/factionInput';
import {
  buildOwnedForGroupAssignRows,
  ownedForGroupAssignRowValidator,
} from './lib/groupAssignPicker';
import { requireAuthUserId } from './lib/policy';
import { enqueueFactionSheetPublication } from './lib/publication';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

async function assertFactionSlugAvailable(
  ctx: MutationCtx,
  slug: string,
  factionId?: Id<'factions'>
) {
  const existing = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (existing && existing._id !== factionId) {
    throw new Error(`Faction slug ${slug} is reserved`);
  }
}

function factionDataForClient(data: unknown) {
  return CanonicalFactionStoredSchema.parse(data);
}

function factionRowForClient(row: Doc<'factions'>) {
  return {
    ...row,
    data: factionDataForClient(row.data),
  };
}

async function listFactionRulesets(ctx: QueryCtx, factionId: Id<'factions'>) {
  const links = await ctx.db
    .query('ruleset_factions')
    .withIndex('by_faction', (q) => q.eq('faction_id', factionId))
    .take(500);
  const rulesets = await Promise.all(links.map((link) => ctx.db.get('rulesets', link.ruleset_id)));
  return rulesets.flatMap((ruleset) =>
    ruleset && !ruleset.is_deleted
      ? [{ id: ruleset._id, name: ruleset.name, slug: ruleset.slug }]
      : []
  );
}

/** Faction detail page bundle (view, edit, and sheet preview). */
async function loadFactionDetailPageBySlug(ctx: QueryCtx, slug: string) {
  const locatedRow = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .unique();
  if (!locatedRow || locatedRow.is_deleted) {
    throw new Error(`Faction with slug ${slug} not found`);
  }

  const access = await loadAssetAccessBundle(ctx, { kind: 'faction', row: locatedRow });
  const row = access.subject;
  const ownerProfile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', row.owner_id))
    .unique();
  if (!ownerProfile) {
    throw new Error(`Profile with user id ${row.owner_id} not found`);
  }

  return {
    faction: {
      ...row,
      data: factionDataForClient(row.data),
    },
    owner: ownerProfile,
    assetPublishing: await factionSheetPublishingStatus(ctx, row._id),
    viewerAccess: access.viewerAccess,
    assignableGroups: access.assignableGroups,
    rulesets: await listFactionRulesets(ctx, row._id),
  };
}

export const getBySlug = query({
  args: { slug: v.string() },
  returns: factionDetailPageValidator,
  handler: async (ctx, args) => loadFactionDetailPageBySlug(ctx, args.slug),
});

export const list = query({
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

/** Public, viewer-independent bundle for the Faction catalogue route. */
export const cataloguePage = query({
  args: {},
  returns: v.object({
    factions: v.array(factionWithRulesetsValidator),
    rulesets: v.array(rulesetSummaryValidator),
    spotlights: v.object({
      newArrival: v.union(factionWithRulesetsValidator, v.null()),
      freshlyUpdated: v.union(factionWithRulesetsValidator, v.null()),
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

export const listForLoadPicker = query({
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
    const memberGroupIds = [...new Set(memberships.map((m) => m.group_id))];

    const groupIds = new Set<Id<'groups'>>();
    for (const row of factionRows) {
      if (row.group_id) {
        groupIds.add(row.group_id);
      }
    }
    const groupNameById = new Map<string, string>();
    for (const gid of groupIds) {
      const group = await ctx.db.get('groups', gid);
      if (group) {
        groupNameById.set(gid, group.name.trim());
      }
    }

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
      const groupId = row.group_id ?? null;
      const groupLabel = groupId ? (groupNameById.get(groupId) ?? groupId) : 'No group';
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

export const listByOwner = query({
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
 * Factions the viewer owns, with their current group's name resolved, for the group-detail "add my
 * faction to this group" picker.
 */
export const listOwnedForGroupAssign = query({
  args: {},
  returns: v.array(ownedForGroupAssignRowValidator('factions')),
  handler: async (ctx) => {
    const userId = await requireAuthUserId(ctx);
    const rows = await ctx.db
      .query('factions')
      .withIndex('by_owner_deleted', (q) => q.eq('owner_id', userId).eq('is_deleted', false))
      .take(500);
    return await buildOwnedForGroupAssignRows(
      ctx,
      rows,
      (row) => factionDataForClient(row.data).name
    );
  },
});

export const listByGroup = query({
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

export const create = mutation({
  args: {
    data: v.any(),
    group_id: v.union(v.id('groups'), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    if (args.group_id) {
      await requireAssignableGroup(ctx, args.group_id);
    }

    const data = parseFactionInput(args.data, {
      requireAuthoringSemantics: true,
    });
    const slug = slugify(data.name);
    await assertFactionSlugAvailable(ctx, slug);

    const now = nowIso();
    const _id = await ctx.db.insert('factions', {
      owner_id: userId,
      data,
      slug,
      group_id: args.group_id,
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    const row = await ctx.db.get(_id);
    if (!row) {
      throw new Error('Failed to create faction');
    }
    await enqueueFactionSheetPublication(ctx, row);
    return factionRowForClient(row);
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
    const slug = slugify(data.name);
    await assertFactionSlugAvailable(ctx, slug, args.id);

    await ctx.db.patch(access.subject._id, {
      data,
      slug,
      updated_at: nowIso(),
    });
    const updated = await ctx.db.get(access.subject._id);
    if (!updated) {
      throw new Error('Failed to update faction');
    }
    await enqueueFactionSheetPublication(ctx, updated);
    return factionRowForClient(updated);
  },
});

export const setGroup = mutation({
  args: {
    id: v.id('factions'),
    group_id: v.union(v.id('groups'), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await requireGroupReassignment(
      ctx,
      { kind: 'faction', id: args.id },
      args.group_id
    );

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
