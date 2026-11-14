import { ConvexError, v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, viewerQuery } from './functions';
import { optionalActiveUserId } from './lib/accountLifecycle';
import { requireFactionFamily } from './lib/collaborativeAccess';
import { factionSharedValidator } from './lib/factionData';
import { loadEmptyFactionsOf, makeDefaultVariant, VARIANT_LISTING_LIMIT, variantsOf } from './lib/factionFamilies';
import type { MutationCtx } from './types';

/*
 * The Faction's settings (#2928): the default variant, the variant order and whether the Faction is open.
 * The Faction's owner and its Group maintain them, and only the owner deletes the Faction (#2910).
 * Eviction lives with the variants, in `factionVariants.evict`.
 */

/** A live variant of this Faction. */
async function liveVariantOf(ctx: MutationCtx, familyId: Id<'faction_families'>, variantId: Id<'factions'>) {
  const variant = await ctx.db.get(variantId);
  if (!variant || variant.is_deleted || variant.family_id !== familyId) {
    throw new ConvexError('That variant is not a live variant of this faction.');
  }
  return variant;
}

/** Refuses an order that is too long, names a variant twice, or names a variant of another Faction. */
async function requireVariantOrder(ctx: MutationCtx, familyId: Id<'faction_families'>, ids: Id<'factions'>[]) {
  if (ids.length > VARIANT_LISTING_LIMIT) {
    throw new ConvexError(`A faction’s order names at most ${VARIANT_LISTING_LIMIT} variants.`);
  }
  if (new Set(ids).size !== ids.length) {
    throw new ConvexError('The order names a variant twice.');
  }
  for (const id of ids) {
    if ((await ctx.db.get(id))?.family_id !== familyId) {
      throw new ConvexError('The order names a variant of another faction.');
    }
  }
}

/** Makes a live variant of the Faction its default: the one its own address leads to, listed first. */
export const setDefaultVariant = mutation({
  args: { family_id: v.id('faction_families'), variant_id: v.id('factions') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFactionFamily(ctx, args.family_id, 'edit');
    await makeDefaultVariant(ctx, family, await liveVariantOf(ctx, family._id, args.variant_id));
    return null;
  },
});

/** Opens the Faction, so anyone signed in may add a variant, or closes it again; closing keeps the variants already in it. */
export const setOpen = mutation({
  args: { family_id: v.id('faction_families'), is_open: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFactionFamily(ctx, args.family_id, 'edit');
    if (family.is_open !== args.is_open) {
      await ctx.db.patch(family._id, { is_open: args.is_open });
    }
    return null;
  },
});

/**
 * Orders the Faction's variants, as dragged into place in the Faction settings.
 * Each id names a variant of this Faction, at most once;
 * a variant left out follows those named, oldest first, and the default is listed first whatever its place.
 * `default_variant_id` makes that live variant the default in the same transaction, for a drag that changes which variant comes first.
 */
export const setVariantOrder = mutation({
  args: {
    family_id: v.id('faction_families'),
    variant_ids: v.array(v.id('factions')),
    default_variant_id: v.optional(v.id('factions')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const family = await requireFactionFamily(ctx, args.family_id, 'edit');
    await requireVariantOrder(ctx, family._id, args.variant_ids);
    if (args.default_variant_id && args.default_variant_id !== family.default_variant_id) {
      await makeDefaultVariant(ctx, family, await liveVariantOf(ctx, family._id, args.default_variant_id));
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
    const family = await requireFactionFamily(ctx, args.family_id, 'delete');
    for await (const variant of variantsOf(ctx, family._id)) {
      if (!variant.is_deleted) {
        throw new ConvexError('Delete or evict every variant of this faction before deleting the faction.');
      }
    }
    await ctx.db.patch(family._id, { is_deleted: true });
    return null;
  },
});

/**
 * The viewer's own Factions left without a live variant, for the rows on their own profile that delete them.
 * Nobody else is told of them, a member of the Faction's Group included, since only the owner may delete one.
 * Empty for a signed-out viewer.
 */
export const ownEmpty = viewerQuery({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('faction_families'),
      slug: v.string(),
      data: v.union(factionSharedValidator.pick('name', 'emblem', 'background'), v.null()),
    })
  ),
  handler: async (ctx) => {
    const viewerId = await optionalActiveUserId(ctx);
    return viewerId ? await loadEmptyFactionsOf(ctx, viewerId) : [];
  },
});
