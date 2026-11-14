import type { PaginationOptions, PaginationResult } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, publicQuery, viewerQuery } from './functions';
import { isActiveProfile } from './lib/accountLifecycle';
import { loadCollaborativeAccess, loadFactionFamilyAccess } from './lib/collaborativeAccess';
import { resolveGroupAssignmentForCreation } from './lib/defaultGroupPreference';
import { allocateFactionAddress } from './lib/factionAddresses';
import { listFactionRulesetCovers } from './lib/factionCatalogue';
import { factionDataValidator } from './lib/factionData';
import { liveVariantsInOrder, ORIGINAL_VARIANT_NAME, variantsOf } from './lib/factionFamilies';
import { parseStoredFactionForRead } from './lib/factionInput';
import {
  followParent,
  inBranchOf,
  insertVariant,
  moveChildrenLater,
  moveToFamily,
  takeSharedFields,
} from './lib/factionVariants';
import { requireAuthUserId } from './lib/policy';
import { nowIso, slugify } from './lib/utils';
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
  for await (const sibling of variantsOf(ctx, familyId)) {
    if (sibling.variant_slug === variantSlug) {
      throw new ConvexError(`This faction already has a variant called “${sibling.variant_name}”.`);
    }
  }
  return variantSlug;
}

/** The name a variant goes by; one made before variants had names is the Original. */
function variantName(variant: Doc<'factions'>) {
  return variant.variant_name ?? ORIGINAL_VARIANT_NAME;
}

/** The Faction's live variants a new one may take as its parent, in the Faction's variant order. */
async function liveVariantChoices(ctx: QueryCtx, family: Doc<'faction_families'>) {
  return (await liveVariantsInOrder(ctx, family)).map((row) => ({ _id: row._id, name: variantName(row) }));
}

/** The variant's Faction, which every variant has once `faction_families_v1` ran. */
async function familyOf(ctx: QueryCtx, variant: Doc<'factions'>) {
  const family = variant.family_id ? await ctx.db.get(variant.family_id) : null;
  if (!family) {
    throw new Error(`Faction ${variant._id} has no family`);
  }
  return family;
}

/** The name an account answers to, or null for one with no username or that is deleted or departing. */
async function activeUsername(ctx: QueryCtx, userId: Id<'users'>) {
  const profile = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', userId))
    .unique();
  return profile && isActiveProfile(profile) ? profile.username : null;
}

/**
 * The variant switcher on a variant's page (#2928): its Faction's live variants in variant order, the default first, each with the address its page lives at.
 * Each variant carries the live rulesets it is linked to, with their cover thumbs, so a reader sees where each one is played.
 * Each also names its parent and its owner, from which the Faction settings tell what an eviction would move, and to whom.
 * The same for every viewer;
 * `isOpen` tells the page whether anyone signed in may add a variant.
 * Null for an unknown or deleted variant, or one whose Faction is deleted.
 */
export const switcher = publicQuery({
  args: { faction_id: v.id('factions') },
  returns: v.union(
    v.null(),
    v.object({
      familyId: v.id('faction_families'),
      familySlug: v.string(),
      isOpen: v.boolean(),
      defaultVariantId: v.id('factions'),
      variants: v.array(
        v.object({
          _id: v.id('factions'),
          name: v.string(),
          slug: v.string(),
          parentId: v.union(v.id('factions'), v.null()),
          ownerName: v.union(v.string(), v.null()),
          rulesets: v.array(
            v.object({
              id: v.id('rulesets'),
              name: v.string(),
              slug: v.string(),
              coverThumbUrl: v.union(v.string(), v.null()),
            })
          ),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const variant = await ctx.db.get(args.faction_id);
    const family = variant?.family_id ? await ctx.db.get(variant.family_id) : null;
    if (!variant || variant.is_deleted || !family || family.is_deleted) {
      return null;
    }
    const variants = await liveVariantsInOrder(ctx, family);
    return {
      familyId: family._id,
      familySlug: family.slug,
      isOpen: family.is_open,
      defaultVariantId: family.default_variant_id,
      variants: await Promise.all(
        variants.map(async (row) => ({
          _id: row._id,
          name: variantName(row),
          slug: row.slug,
          parentId: row.parent_id ?? null,
          ownerName: await activeUsername(ctx, row.owner_id),
          rulesets: await listFactionRulesetCovers(ctx, row._id),
        }))
      ),
    };
  },
});

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
      variants: await liveVariantChoices(ctx, family),
      familySlug: family.slug,
    };
  },
});

/**
 * Adds a variant to a Faction, optionally following one parent variant, fixed from now on (#2927).
 * Its maintainers may always add variants;
 * anyone signed in may add one to an open Faction, with no approval (#2928).
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
    const family = await familyOf(ctx, base);
    if (family.is_deleted) {
      throw new ConvexError('That faction no longer exists.');
    }
    if (!family.is_open && !(await loadFactionFamilyAccess(ctx, family)).capabilities.edit) {
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
 * Hands `visit` the one variant at the cursor, and answers the cursor of the next, or null after the last.
 * A push-down takes one variant per transaction, so each schedules itself again from the cursor this answers.
 */
async function visitNextVariant(
  variants: { paginate: (options: PaginationOptions) => Promise<PaginationResult<Doc<'factions'>>> },
  cursor: string | null,
  visit: (variant: Doc<'factions'>) => Promise<void>
) {
  const page = await variants.paginate({ numItems: 1, cursor });
  for (const variant of page.page) {
    await visit(variant);
  }
  return page.isDone ? null : page.continueCursor;
}

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
    const children = ctx.db.query('factions').withIndex('by_parent', (q) => q.eq('parent_id', args.parentId));
    const cursor = await visitNextVariant(children, args.cursor, (child) => followParent(ctx, parent, child));
    if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.factionVariants.pushToChildren, { ...args, cursor });
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
    const cursor = await visitNextVariant(variantsOf(ctx, family._id), args.cursor, (variant) =>
      takeSharedFields(ctx, family.data, variant)
    );
    if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.factionVariants.pushSharedFields, { ...args, cursor });
    }
    return null;
  },
});

/**
 * Evicts a variant into a Faction of its own (#2911): a clean split, for the Faction's owner and its Group.
 * Its whole branch moves with it, so no parent link crosses Factions;
 * only its own link to its parent is cut, and what it followed becomes its own, at the values it holds now, so the branch looks as it did.
 * The new Faction copies the old one's shared fields, belongs to the variant's owner and Group, starts closed, and has the variant as its default.
 * Ruleset links stay, since the variant keeps its id.
 * The variant moves here;
 * its descendants follow one per transaction, and their old addresses lead to the new ones.
 */
export const evict = mutation({
  args: { faction_id: v.id('factions') },
  returns: v.object({ family_id: v.id('faction_families'), slug: v.string() }),
  handler: async (ctx, args) => {
    await requireAuthUserId(ctx);
    const variant = await liveVariant(ctx, args.faction_id);
    const family = await familyOf(ctx, variant);
    if (!(await loadFactionFamilyAccess(ctx, family)).capabilities.edit) {
      throw new Error('Not authorized');
    }
    if (await inBranchOf(ctx, family.default_variant_id, variant._id)) {
      throw new ConvexError(
        'The default variant would leave with this branch. Make another variant the default first.'
      );
    }
    const familyId = await ctx.db.insert('faction_families', {
      slug: await allocateFactionAddress(ctx, slugify(family.data?.name ?? '') || family.slug),
      data: family.data,
      owner_id: variant.owner_id,
      group_id: variant.group_id,
      default_variant_id: variant._id,
      is_open: false,
      is_deleted: false,
      created_at: nowIso(),
      updated_at: variant.updated_at,
    });
    const moved = await moveToFamily(ctx, variant, (await ctx.db.get(familyId))!, {
      parent_id: undefined,
      inherited: undefined,
    });
    await moveChildrenLater(ctx, variant._id);
    return { family_id: familyId, slug: moved.slug };
  },
});

/**
 * Brings a variant's children into its Faction, one child per transaction, then theirs as each child moves (#2911).
 * It reads the parent's Faction afresh each time, so a branch evicted again while it moves still ends up together.
 */
export const moveBranch = internalMutation({
  args: { parentId: v.id('factions'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.parentId);
    const family = parent?.family_id ? await ctx.db.get(parent.family_id) : null;
    if (!family) {
      return null;
    }
    const children = ctx.db.query('factions').withIndex('by_parent', (q) => q.eq('parent_id', args.parentId));
    const cursor = await visitNextVariant(children, args.cursor, async (child) => {
      if (child.family_id !== family._id) {
        await moveToFamily(ctx, child, family);
        await moveChildrenLater(ctx, child._id);
      }
    });
    if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.factionVariants.moveBranch, { ...args, cursor });
    }
    return null;
  },
});
