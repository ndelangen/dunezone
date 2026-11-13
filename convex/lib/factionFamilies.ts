import type { Triggers } from 'convex-helpers/server/triggers';
import { z } from 'zod';

import { splitSharedFields } from '../../src/shared/factions/sharedFields';
import { slugify } from '../../src/shared/slugify';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import { allocateVariantAddress } from './factionAddresses';
import { parseStoredFactionForRead } from './factionInput';

/** The variant name a faction gets when no live ruleset links it. */
export const ORIGINAL_VARIANT_NAME = 'Original';
const ORIGINAL_VARIANT_SLUG = slugify(ORIGINAL_VARIANT_NAME);

type FactionData = ReturnType<typeof parseStoredFactionForRead>;

/** Which side of the split a save changes, so each side is authorized by whoever maintains it. */
export function factionDataChange(stored: FactionData, proposed: FactionData) {
  const before = splitSharedFields(stored);
  const after = splitSharedFields(proposed);
  return {
    shared: canonicalJson(before.shared) !== canonicalJson(after.shared),
    variant: canonicalJson(before.variant) !== canonicalJson(after.variant),
  };
}

/** The shared fields of a variant's stored data, or null while that data does not parse, so a broken legacy faction never blocks its own write. */
function sharedData(faction: Doc<'factions'>) {
  try {
    return splitSharedFields(parseStoredFactionForRead(faction.data)).shared;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return null;
    }
    throw error;
  }
}

/**
 * Mirrored from the family's single variant until a Faction can hold several (#2927).
 * The Group is not: a Faction keeps its own, which starts as its first variant's and then changes only on the Faction (#2910).
 * Nor is the address: the Faction keeps the one its variant had, and the variant moves to one of its own under it (#2909).
 */
function mirroredFields(faction: Doc<'factions'>) {
  return {
    data: sharedData(faction),
    owner_id: faction.owner_id,
    is_deleted: faction.is_deleted,
    created_at: faction.created_at,
    updated_at: faction.updated_at,
  };
}

/** The name of the first live ruleset that links the faction, by when the link was made, or "Original" when none does or its name is blank. */
async function firstVariantName(ctx: Pick<QueryCtx, 'db'>, factionId: Id<'factions'>) {
  for await (const link of ctx.db
    .query('ruleset_factions')
    .withIndex('by_faction', (q) => q.eq('faction_id', factionId))) {
    const ruleset = await ctx.db.get(link.ruleset_id);
    if (ruleset && !ruleset.is_deleted) {
      return ruleset.name.trim() || ORIGINAL_VARIANT_NAME;
    }
  }
  return ORIGINAL_VARIANT_NAME;
}

async function createFamily(ctx: MutationCtx, faction: Doc<'factions'>) {
  const familyId = await ctx.db.insert('faction_families', {
    ...mirroredFields(faction),
    slug: faction.slug,
    group_id: faction.group_id,
    default_variant_id: faction._id,
    is_open: false,
  });
  const variantName = await firstVariantName(ctx, faction._id);
  const variantSlug = slugify(variantName) || ORIGINAL_VARIANT_SLUG;
  /* The faction keeps the address it was made at, and the variant moves under it (#2909). */
  await ctx.db.patch(faction._id, {
    family_id: familyId,
    variant_name: variantName,
    variant_slug: variantSlug,
    slug: await allocateVariantAddress(ctx, faction.slug, faction._id, variantSlug),
  });
}

/**
 * Gives a faction its family, or brings the family it has up to date;
 * rerunning it on an unchanged faction writes nothing.
 * The variant name is chosen once, when the family is made, so later ruleset links never rename it.
 */
export async function syncFactionFamily(ctx: MutationCtx, id: Id<'factions'>, faction: Doc<'factions'> | null) {
  if (!faction) {
    await deleteOrphanedFamily(ctx, id);
    return;
  }
  const family = faction.family_id ? await ctx.db.get(faction.family_id) : null;
  if (!family) {
    await createFamily(ctx, faction);
    return;
  }
  if (family.default_variant_id !== faction._id) {
    return;
  }
  const fields = mirroredFields(faction);
  if (!mirrors(family, fields)) {
    await ctx.db.patch(family._id, fields);
  }
}

/**
 * Whether the family already holds what its variant would mirror onto it.
 * Every family field that is not mirrored must be left out here, or each sync would patch it.
 */
function mirrors(family: Doc<'faction_families'>, fields: ReturnType<typeof mirroredFields>) {
  const {
    _id,
    _creationTime,
    default_variant_id: _default,
    is_open: _open,
    group_id: _group,
    slug: _slug,
    ...stored
  } = family;
  return canonicalJson(stored) === canonicalJson(fields);
}

/** A family goes with its single variant when that row is removed outright, such as by account deletion. */
async function deleteOrphanedFamily(ctx: MutationCtx, id: Id<'factions'>) {
  const family = await ctx.db
    .query('faction_families')
    .withIndex('by_default_variant', (q) => q.eq('default_variant_id', id))
    .first();
  if (family) {
    await ctx.db.delete(family._id);
  }
}

/** Throws unless the faction is a variant of a family that exists and, while it is the only variant, mirrors it exactly. */
export async function assertFactionFamily(ctx: Pick<QueryCtx, 'db'>, faction: Doc<'factions'>) {
  const family = faction.family_id ? await ctx.db.get(faction.family_id) : null;
  if (!family) {
    throw new Error(`Faction ${faction._id} has no family`);
  }
  if (!faction.variant_name || !faction.variant_slug) {
    throw new Error(`Faction ${faction._id} has no variant name`);
  }
  assertMirrorsDefaultVariant(family, faction);
}

/** Throws when the faction is its family's default variant and the family no longer mirrors it. */
function assertMirrorsDefaultVariant(family: Doc<'faction_families'>, faction: Doc<'factions'>) {
  if (family.default_variant_id === faction._id && !mirrors(family, mirroredFields(faction))) {
    throw new Error(`Faction family ${family._id} does not mirror its variant ${faction._id}`);
  }
}

export function registerFactionFamilyTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    await syncFactionFamily(ctx, change.id, change.newDoc);
  });
}
