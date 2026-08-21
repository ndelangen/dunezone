import { v } from 'convex/values';

import { RULESET_ASSET_SLOTS } from '../src/shared/rulesets/assetSlots';
import { rulesetInputSchema } from '../src/shared/rulesets/validation';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { mutation } from './functions';
import {
  requireGroupReassignment,
  requireRulesetMaintenance,
  requireRulesetSoftDelete,
  requireRulesetUpdate,
} from './lib/collaborativeAccess';
import { rulesetDetailPageValidator, rulesetPublicBundleValidator } from './lib/collaborativeAccessValidators';
import { resolveGroupAssignmentForCreation } from './lib/defaultGroupPreference';
import {
  buildOwnedForGroupAssignRows,
  OWNED_FOR_GROUP_ASSIGN_LIMIT,
  ownedForGroupAssignRowValidator,
} from './lib/groupAssignPicker';
import { requireAuthUserId } from './lib/policy';
import { loadRulesetDetailPageBySlug, loadRulesetPublicBundleBySlug } from './lib/rulesetDetailPage';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

async function getRulesetById(ctx: QueryCtx | MutationCtx, id: Id<'rulesets'>) {
  return await ctx.db.get(id);
}

/**
 * The patch an update writes.
 * `image_cover` keeps the absent-means-untouched rule, since clearing a cover is expressed as `null`;
 * name and description are required of every write, so they are always part of the patch.
 * The shape is inferred rather than restated, so adding a field here cannot drift from the type that describes it.
 */
function rulesetUpdatePatch(fields: { name: string; slug: string; description: string; image_cover?: string | null }) {
  return {
    name: fields.name,
    slug: fields.slug,
    description: fields.description,
    updated_at: nowIso(),
    ...(fields.image_cover === undefined ? {} : { image_cover: fields.image_cover }),
  };
}

async function resolveUniqueRulesetSlug(ctx: QueryCtx | MutationCtx, name: string, excludeId?: Id<'rulesets'>) {
  const baseSlug = slugify(name) || 'ruleset';
  let slug = baseSlug;
  let suffix = 1;
  while (true) {
    const existing = await ctx.db
      .query('rulesets')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!existing || (excludeId && existing._id === excludeId)) {
      return slug;
    }
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('rulesets')
      .withIndex('by_deleted_name', (q) => q.eq('is_deleted', false))
      .take(500);
  },
});

export const get = query({
  args: { id: v.id('rulesets') },
  handler: async (ctx, args) => {
    const row = await getRulesetById(ctx, args.id);
    if (!row || row.is_deleted) {
      throw new Error(`Ruleset with id ${args.id} not found`);
    }
    return row;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: rulesetPublicBundleValidator,
  handler: async (ctx, args) => await loadRulesetPublicBundleBySlug(ctx, args.slug),
});

export const detailPageBySlug = query({
  args: { slug: v.string() },
  returns: rulesetDetailPageValidator,
  handler: async (ctx, args) => await loadRulesetDetailPageBySlug(ctx, args.slug),
});

/**
 * Rulesets the viewer owns, with their current group's name resolved, for the group-detail "add my ruleset to this group" picker.
 */
export const listOwnedForGroupAssign = query({
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

export const listByFaction = query({
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
    description: v.string(),
    group_id: v.optional(v.union(v.id('groups'), v.null())),
    image_cover: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const parsed = rulesetInputSchema.safeParse({ name: args.name, description: args.description });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid ruleset input');
    }
    const normalizedName = parsed.data.name;

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
      description: parsed.data.description,
      slug,
      owner_id: userId,
      group_id: groupAssignment.group_id,
      image_cover: args.image_cover,
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
    description: v.string(),
    image_cover: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const parsed = rulesetInputSchema.safeParse({ name: args.name, description: args.description });
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(' ');
      throw new Error(msg || 'Invalid ruleset input');
    }
    const normalizedName = parsed.data.name;
    const access = await requireRulesetUpdate(ctx, args.id, { name: normalizedName });
    const ruleset = access.subject;

    const duplicate = await ctx.db
      .query('rulesets')
      .withIndex('by_name', (q) => q.eq('name', normalizedName))
      .take(25);
    if (duplicate.some((row) => row._id !== args.id && !row.is_deleted)) {
      throw new Error('Ruleset name already exists');
    }

    await ctx.db.patch(
      ruleset._id,
      rulesetUpdatePatch({
        name: normalizedName,
        slug: await resolveUniqueRulesetSlug(ctx, normalizedName, args.id),
        description: parsed.data.description,
        image_cover: args.image_cover,
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
 * Separate from `update` on purpose: assigning a group is the owner's `changeGroup` capability rather than the content edit any active member may make, and a caller here cannot express a name or a description at all — so moving a group can never overwrite either.
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
      await ctx.db.insert('ruleset_factions', {
        ruleset_id: args.ruleset_id,
        faction_id: args.faction_id,
      });
    }
    return args;
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
 * `ruleset_asset_slots` declares the same five literals and cannot import the shared table without ceasing to be a schema, so a drift test holds the two together.
 */
const assetSlotValidator = v.union(
  v.literal('treachery'),
  v.literal('spice'),
  v.literal('custom'),
  v.literal('techToken'),
  v.literal('customTokens')
);

/** Bounds one slot's contents. The many-asset slots are curated by hand, so this is a ceiling on nonsense rather than a paging limit. */
const SLOT_CONTENTS_LIMIT = 100;

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
