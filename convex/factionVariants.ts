import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, viewerQuery } from './functions';
import { loadCollaborativeAccess, loadFactionFamilyAccess } from './lib/collaborativeAccess';
import { resolveGroupAssignmentForCreation } from './lib/defaultGroupPreference';
import { allocateFactionAddress } from './lib/factionAddresses';
import { factionDataValidator } from './lib/factionData';
import { ORIGINAL_VARIANT_NAME } from './lib/factionFamilies';
import { parseStoredFactionForRead } from './lib/factionInput';
import { followParent, insertVariant, takeSharedFields } from './lib/factionVariants';
import { requireAuthUserId } from './lib/policy';
import { slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

async function liveVariant(ctx: MutationCtx, id: Id<'factions'>) {
  const row = await ctx.db.get(id);
  if (!row || row.is_deleted) {
    throw new ConvexError('That variant no longer exists.');
  }
  return row;
}

/** The parent a new variant may follow: a live variant of the same Faction, or none. */
async function parentFor(ctx: MutationCtx, base: Doc<'factions'>, parentId: Id<'factions'> | undefined) {
  if (!parentId) {
    return null;
  }
  const parent = await liveVariant(ctx, parentId);
  if (parent.family_id !== base.family_id) {
    throw new ConvexError('A parent variant must belong to the same faction.');
  }
  return parent;
}

/** The new variant's own slug, which no other variant of the Faction may already use. */
async function newVariantSlug(ctx: MutationCtx, familyId: Id<'faction_families'>, name: string) {
  const variantSlug = slugify(name);
  if (!variantSlug) {
    throw new ConvexError('Give the variant a name.');
  }
  for await (const sibling of ctx.db.query('factions').withIndex('by_family', (q) => q.eq('family_id', familyId))) {
    if (sibling.variant_slug === variantSlug) {
      throw new ConvexError(`This faction already has a variant called “${sibling.variant_name}”.`);
    }
  }
  return variantSlug;
}

/** The most variants the create popover offers as a parent. */
const VARIANT_CHOICE_LIMIT = 200;

/** The name a variant goes by; one made before variants had names is the Original. */
function variantName(variant: Doc<'factions'>) {
  return variant.variant_name ?? ORIGINAL_VARIANT_NAME;
}

/** The Faction's live variants, oldest first, with the deleted ones passed over before the limit counts. */
async function liveVariantChoices(ctx: QueryCtx, familyId: Id<'faction_families'>) {
  const choices: { _id: Id<'factions'>; name: string }[] = [];
  for await (const row of ctx.db.query('factions').withIndex('by_family', (q) => q.eq('family_id', familyId))) {
    if (!row.is_deleted) {
      choices.push({ _id: row._id, name: variantName(row) });
    }
    if (choices.length === VARIANT_CHOICE_LIMIT) {
      break;
    }
  }
  return choices;
}

/**
 * What editing a variant needs beyond its public page: the parent it follows with that parent's current data, and the Faction's live variants a new one may take as its parent (#2927).
 * It answers only someone who may edit the variant or its Faction, and null for anyone else, so a reader's page never carries it.
 * A soft-deleted parent still answers, since its children keep following it (#2908).
 */
export const editorContext = viewerQuery({
  args: { faction_id: v.id('factions') },
  returns: v.union(
    v.null(),
    v.object({
      parent: v.union(v.null(), v.object({ name: v.string(), data: factionDataValidator })),
      variants: v.array(v.object({ _id: v.id('factions'), name: v.string() })),
      familySlug: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const variant = await ctx.db.get(args.faction_id);
    const family = variant?.family_id ? await ctx.db.get(variant.family_id) : null;
    if (!variant || variant.is_deleted || !family) {
      return null;
    }
    const { viewerAccess } = await loadCollaborativeAccess(ctx, { kind: 'faction', id: variant._id });
    const mayEdit = viewerAccess.capabilities.edit || (await loadFactionFamilyAccess(ctx, family)).capabilities.edit;
    if (!mayEdit) {
      return null;
    }
    const parent = variant.parent_id ? await ctx.db.get(variant.parent_id) : null;
    return {
      parent: parent && { name: variantName(parent), data: parseStoredFactionForRead(parent.data) },
      variants: await liveVariantChoices(ctx, family._id),
      familySlug: family.slug,
    };
  },
});

/**
 * Adds a variant to a Faction, optionally following one parent variant, fixed from now on (#2927).
 * Its maintainers may add variants;
 * opening a Faction to everyone comes with #2928.
 */
export const create = mutation({
  args: {
    /** Any variant of the Faction to add to. */
    faction_id: v.id('factions'),
    name: v.string(),
    parent_id: v.optional(v.id('factions')),
    group_id: v.optional(v.union(v.id('groups'), v.null())),
  },
  returns: v.object({ id: v.id('factions'), slug: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireAuthUserId(ctx);
    const base = await liveVariant(ctx, args.faction_id);
    const family = base.family_id ? await ctx.db.get(base.family_id) : null;
    if (!family) {
      throw new Error(`Faction ${args.faction_id} has no family`);
    }
    if (!(await loadFactionFamilyAccess(ctx, family)).capabilities.edit) {
      throw new Error('Not authorized');
    }
    const parent = await parentFor(ctx, base, args.parent_id);
    const name = args.name.trim();
    const variantSlug = await newVariantSlug(ctx, family._id, name);
    const { group_id: groupId } = await resolveGroupAssignmentForCreation(ctx, userId, args.group_id);
    const row = await insertVariant(ctx, {
      base,
      parent,
      name,
      ownerId: userId,
      groupId,
      address: await allocateFactionAddress(ctx, `${family.slug}-${variantSlug}`),
    });
    return { id: row._id, slug: row.slug };
  },
});

/**
 * Carries a parent's save to its children, one child per transaction, then to theirs as each child saves (#2907).
 * A newer save of the parent starts its own push-down, so this one stops.
 * Soft-deleted children are followed too, so changes keep flowing through them (#2908).
 */
export const pushToChildren = internalMutation({
  args: { parentId: v.id('factions'), revision: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentId);
    if (!parent || (parent.revision ?? 0) !== args.revision) {
      return null;
    }
    const page = await ctx.db
      .query('factions')
      .withIndex('by_parent', (q) => q.eq('parent_id', args.parentId))
      .paginate({ numItems: 1, cursor: args.cursor });
    for (const child of page.page) {
      await followParent(ctx, parent, child);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.factionVariants.pushToChildren, {
        ...args,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});

/** Carries a Faction's shared fields to every one of its variants, one variant per transaction. */
export const pushSharedFields = internalMutation({
  args: { familyId: v.id('faction_families'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await ctx.db.get(args.familyId);
    if (!family) {
      return null;
    }
    const page = await ctx.db
      .query('factions')
      .withIndex('by_family', (q) => q.eq('family_id', args.familyId))
      .paginate({ numItems: 1, cursor: args.cursor });
    for (const variant of page.page) {
      await takeSharedFields(ctx, family, variant);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.factionVariants.pushSharedFields, {
        ...args,
        cursor: page.continueCursor,
      });
    }
    return null;
  },
});
