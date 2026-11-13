import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation } from './functions';
import { loadFactionFamilyAccess } from './lib/collaborativeAccess';
import { makeDefaultVariant, VARIANT_LISTING_LIMIT, variantsOf } from './lib/factionFamilies';
import { requireAuthUserId } from './lib/policy';
import type { MutationCtx } from './types';

/*
 * The Faction tab's settings (#2928): the default variant, the variant order and whether the Faction is open.
 * The Faction's owner and its Group maintain them, and only the owner deletes the Faction (#2910).
 * Eviction lives with the variants, in `factionVariants.evict`.
 */

/** The live Faction, if the viewer may do `capability` on it: `edit` for its owner and Group, `delete` for its owner alone. */
async function requireFamily(ctx: MutationCtx, familyId: Id<'faction_families'>, capability: 'edit' | 'delete') {
  await requireAuthUserId(ctx);
  const family = await ctx.db.get(familyId);
  if (!family || family.is_deleted) {
    throw new ConvexError('That faction no longer exists.');
  }
  if (!(await loadFactionFamilyAccess(ctx, family)).capabilities[capability]) {
    throw new Error('Not authorized');
  }
  return family;
}

/** A live variant of this Faction. */
async function liveVariantOf(ctx: MutationCtx, familyId: Id<'faction_families'>, variantId: Id<'factions'>) {
  const variant = await ctx.db.get(variantId);
  if (!variant || variant.is_deleted || variant.family_id !== familyId) {
    throw new ConvexError('That variant is not a live variant of this faction.');
  }
  return variant;
}

/** Makes a live variant of the Faction its default: the one its own address leads to, listed first. */
export const setDefaultVariant = mutation({
  args: { family_id: v.id('faction_families'), variant_id: v.id('factions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFamily(ctx, args.family_id, 'edit');
    await makeDefaultVariant(ctx, family, await liveVariantOf(ctx, family._id, args.variant_id));
    return null;
  },
});

/** Opens the Faction, so anyone signed in may add a variant, or closes it again; closing keeps the variants already in it. */
export const setOpen = mutation({
  args: { family_id: v.id('faction_families'), is_open: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFamily(ctx, args.family_id, 'edit');
    if (family.is_open !== args.is_open) {
      await ctx.db.patch(family._id, { is_open: args.is_open });
    }
    return null;
  },
});

/**
 * Orders the Faction's variants, as dragged into place on the Faction tab.
 * Each id names a variant of this Faction, at most once;
 * a variant left out follows those named, oldest first, and the default is listed first whatever its place.
 */
export const setVariantOrder = mutation({
  args: { family_id: v.id('faction_families'), variant_ids: v.array(v.id('factions')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFamily(ctx, args.family_id, 'edit');
    if (args.variant_ids.length > VARIANT_LISTING_LIMIT) {
      throw new ConvexError(`A faction’s order names at most ${VARIANT_LISTING_LIMIT} variants.`);
    }
    if (new Set(args.variant_ids).size !== args.variant_ids.length) {
      throw new ConvexError('The order names a variant twice.');
    }
    for (const id of args.variant_ids) {
      const variant = await ctx.db.get(id);
      if (variant?.family_id !== family._id) {
        throw new ConvexError('The order names a variant of another faction.');
      }
    }
    await ctx.db.patch(family._id, { variant_order: args.variant_ids });
    return null;
  },
});

/**
 * Deletes the Faction: its owner alone, and only once it holds no live variant (#2910).
 * Like every deletion it keeps the row, so the Faction's address stays reserved (ADR-0003).
 */
export const remove = mutation({
  args: { family_id: v.id('faction_families') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFamily(ctx, args.family_id, 'delete');
    for await (const variant of variantsOf(ctx, family._id)) {
      if (!variant.is_deleted) {
        throw new ConvexError('Delete or evict every variant of this faction before deleting the faction.');
      }
    }
    await ctx.db.patch(family._id, { is_deleted: true });
    return null;
  },
});
