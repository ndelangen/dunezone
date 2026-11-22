import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, publicQuery, viewerQuery } from './functions';
import { optionalActiveUserId } from './lib/accountLifecycle';
import { isActiveProfile } from './lib/accountLifecycle';
import { ALL_PARTITION } from './lib/catalogueOrder';
import { paginateCatalogueEntries } from './lib/cataloguePickerOptions';
import { liveGroupOrNull, requireFactionFamily } from './lib/collaborativeAccess';
import { factionSharedValidator } from './lib/factionData';
import { loadEmptyFactionsOf, makeDefaultVariant, VARIANT_LISTING_LIMIT, variantsOf } from './lib/factionFamilies';
import { nexusLinkTarget } from './lib/nexusFaction';
import type { MutationCtx, QueryCtx } from './types';

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

/** One Faction as the Nexus card's picker lists it: what a row draws, who maintains it, and how many live variants it has. */
const nexusChoiceValidator = v.object({
  id: v.id('faction_families'),
  slug: v.string(),
  ...factionSharedValidator.pick('name', 'emblem', 'background').fields,
  owner: v.union(v.string(), v.null()),
  group: v.union(v.string(), v.null()),
  variantCount: v.number(),
});

/** The Faction of one catalogue entry as a picker row, or null where it is deleted or its shared fields do not parse. */
async function nexusFactionChoice(ctx: QueryCtx, entry: Doc<'catalogue_entries'>) {
  const id = ctx.db.normalizeId('faction_families', entry.source_id);
  const family = id ? await ctx.db.get('faction_families', id) : null;
  if (!family || family.is_deleted || !family.data) {
    return null;
  }
  const owner = await ctx.db
    .query('profiles')
    .withIndex('by_user_id', (q) => q.eq('user_id', family.owner_id))
    .unique();
  const group = family.group_id ? liveGroupOrNull(await ctx.db.get('groups', family.group_id)) : null;
  return {
    id: family._id,
    slug: family.slug,
    name: family.data.name,
    emblem: family.data.emblem,
    background: family.data.background,
    /* A deleted or departing account no longer answers to its name, and a deleted Group names nothing (ADR-0003). */
    owner: owner && isActiveProfile(owner) ? (owner.username ?? null) : null,
    group: group?.name.trim() || null,
    variantCount: entry.variant_count ?? 1,
  };
}

/**
 * The Factions a Nexus card may link, one per Faction and never one per variant (#2921), newest first.
 * A search finds a Faction by its own names and by any variant's, as the catalogue does, since its entry holds them all.
 * Each page reads its catalogue entries, and for each its Faction, owner and Group;
 * no variant is read, as the entry holds the variant count (#2929).
 */
export const nexusChoices = publicQuery({
  args: { q: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(nexusChoiceValidator),
  handler: async (ctx, args) => {
    const entries = await paginateCatalogueEntries(ctx, { ...args, kind: 'faction_family', partition: ALL_PARTITION });
    const page = await Promise.all(entries.page.map((entry) => nexusFactionChoice(ctx, entry)));
    return { ...entries, page: page.filter((choice) => choice !== null) };
  },
});

/**
 * The Faction a Nexus card's link leads to, by the id the link carries, for the editor's Faction field: its id and address, and how many live variants it has.
 * A card that still links one live variant, as one saved before the 15 November 2026 move (#2959) can, gets that variant's Faction back.
 * Null for an id that names no live Faction or variant.
 */
export const nexusLink = publicQuery({
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id('faction_families'),
      slug: v.string(),
      variantCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const target = await nexusLinkTarget(ctx, args.id);
    if (!target) {
      return null;
    }
    const family =
      target.kind === 'faction' ? target.family : await ctx.db.get('faction_families', target.variant.family_id);
    if (!family || family.is_deleted) {
      return null;
    }
    /* The count is read off the Faction's catalogue entry, which holds it without reading the variants (#2929). */
    const entry = await ctx.db
      .query('catalogue_entries')
      .withIndex('by_kind_source', (q) =>
        q.eq('kind', 'faction_family').eq('source_id', family._id).eq('partition', ALL_PARTITION)
      )
      .first();
    return {
      id: family._id,
      slug: family.slug,
      variantCount: entry?.variant_count ?? 1,
    };
  },
});
