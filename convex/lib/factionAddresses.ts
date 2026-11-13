import { slugify } from '../../src/shared/slugify';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { recordFormerSlug } from './formerSlugs';
import { allocateCounterSlug } from './slugCounters';

/*
 * A faction lives at `/factions/<factionSlug>`, which leads to its default variant,
 * and each variant at `/factions/<factionSlug>-<variantSlug>` (#2909).
 * Both kinds of address share one namespace, so `atreides-dream` is never both a variant of `atreides` and a faction of its own:
 * a clash takes the next counter suffix, as a repeated name always has.
 */

/** The records an address may already belong to without being taken: the faction and variant asking for it. */
type Own = { factionId?: Id<'factions'>; familyId?: Id<'faction_families'> };

async function addressFree(ctx: MutationCtx, slug: string, own: Own) {
  if (slug === 'create') {
    return false;
  }
  const variant = await ctx.db
    .query('factions')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first();
  if (variant && variant._id !== own.factionId) {
    return false;
  }
  const family = await ctx.db
    .query('faction_families')
    .withIndex('by_slug', (q) => q.eq('slug', slug))
    .first();
  return !family || family._id === own.familyId;
}

/** A free address under `/factions/` for this base, with a counter suffix when it is taken. */
export async function allocateFactionAddress(ctx: MutationCtx, base: string, own: Own = {}) {
  return await allocateCounterSlug(ctx, `faction-slug:${JSON.stringify([base])}`, base, (slug) =>
    addressFree(ctx, slug, own)
  );
}

/** A free address for the variant under its faction's. */
export async function allocateVariantAddress(
  ctx: MutationCtx,
  family: Doc<'faction_families'>,
  faction: Doc<'factions'>,
  variantSlug: string
) {
  return await allocateFactionAddress(ctx, `${family.slug}-${variantSlug}`, {
    factionId: faction._id,
    familyId: family._id,
  });
}

/** The variant's family and its own slug, once the variant has both. */
async function placeInFamily(ctx: MutationCtx, faction: Doc<'factions'>) {
  const family = faction.family_id ? await ctx.db.get(faction.family_id) : null;
  return family && faction.variant_slug ? { family, variantSlug: faction.variant_slug } : null;
}

type PlaceInFamily = NonNullable<Awaited<ReturnType<typeof placeInFamily>>>;

/**
 * Moves a variant that still answers at its faction's own address to an address of its own.
 * The faction keeps the old address and leads it to its default variant, so no link breaks and nothing is recorded.
 * Rerunning it on a variant that already moved writes nothing.
 */
export async function moveToVariantAddress(ctx: MutationCtx, faction: Doc<'factions'>) {
  const place = await placeInFamily(ctx, faction);
  if (!place || faction.slug !== place.family.slug) {
    return;
  }
  await ctx.db.patch(faction._id, {
    slug: await allocateVariantAddress(ctx, place.family, faction, place.variantSlug),
  });
}

/**
 * The variant's address after a save that names the faction `name`.
 * A faction rename moves the faction's address and the variant's under it, and records both former ones so old links follow.
 * A save that keeps the name keeps both, suffixes included.
 */
export async function variantAddressAfterSave(ctx: MutationCtx, faction: Doc<'factions'>, name: string) {
  const base = slugify(name);
  if (slugify((faction.data as { name: string }).name) === base && faction.slug !== 'create') {
    return faction.slug;
  }
  const place = await placeInFamily(ctx, faction);
  const slug = place
    ? await renameFamily(ctx, place, faction, base)
    : await allocateFactionAddress(ctx, base, { factionId: faction._id });
  await recordFormerSlug(ctx, { kind: 'faction', scope: '', slug: faction.slug, record_id: faction._id });
  return slug;
}

/** Gives the faction the address its new name asks for, and returns the variant's address under it. */
async function renameFamily(
  ctx: MutationCtx,
  { family, variantSlug }: PlaceInFamily,
  faction: Doc<'factions'>,
  base: string
) {
  const familySlug = await allocateFactionAddress(ctx, base, { familyId: family._id, factionId: faction._id });
  await recordFormerSlug(ctx, { kind: 'faction_family', scope: '', slug: family.slug, record_id: family._id });
  await ctx.db.patch(family._id, { slug: familySlug });
  return await allocateVariantAddress(ctx, { ...family, slug: familySlug }, faction, variantSlug);
}

/** Throws unless the variant answers at an address of its own under its faction's. */
export async function assertVariantAddress(ctx: Pick<MutationCtx, 'db'>, faction: Doc<'factions'>) {
  const family = faction.family_id ? await ctx.db.get(faction.family_id) : null;
  if (!family || !faction.slug.startsWith(`${family.slug}-`)) {
    throw new Error(`Faction ${faction._id} has no address of its own under its family's`);
  }
}
