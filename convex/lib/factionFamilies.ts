import type { Triggers } from 'convex-helpers/server/triggers';
import { z } from 'zod';

import { slugify } from '../../src/shared/slugify';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import { parseStoredFactionForRead } from './factionInput';

/** The variant name a faction gets when no live ruleset links it. */
export const ORIGINAL_VARIANT_NAME = 'Original';

/** The shared fields of a variant's stored data, or null while that data does not parse, so a broken legacy faction never blocks its own write. */
function sharedData(faction: Doc<'factions'>) {
  try {
    const { name, emblem, background, themeColor, colors } = parseStoredFactionForRead(faction.data);
    return { name, emblem, background, themeColor, colors };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return null;
    }
    throw error;
  }
}

/** Mirrored from the family's single variant until shared fields move to the family (#2926). */
function mirroredFields(faction: Doc<'factions'>) {
  return {
    slug: faction.slug,
    data: sharedData(faction),
    owner_id: faction.owner_id,
    group_id: faction.group_id,
    is_deleted: faction.is_deleted,
    created_at: faction.created_at,
    updated_at: faction.updated_at,
  };
}

/** The name of the first live ruleset that links the faction, by when the link was made, or "Original" when none does. */
async function firstVariantName(ctx: Pick<QueryCtx, 'db'>, factionId: Id<'factions'>) {
  for await (const link of ctx.db
    .query('ruleset_factions')
    .withIndex('by_faction', (q) => q.eq('faction_id', factionId))) {
    const ruleset = await ctx.db.get(link.ruleset_id);
    if (ruleset && !ruleset.is_deleted) {
      return ruleset.name;
    }
  }
  return ORIGINAL_VARIANT_NAME;
}

async function createFamily(ctx: MutationCtx, faction: Doc<'factions'>) {
  const familyId = await ctx.db.insert('faction_families', {
    ...mirroredFields(faction),
    default_variant_id: faction._id,
    is_open: false,
  });
  const variantName = await firstVariantName(ctx, faction._id);
  await ctx.db.patch(faction._id, {
    family_id: familyId,
    variant_name: variantName,
    variant_slug: slugify(variantName) || slugify(ORIGINAL_VARIANT_NAME),
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
  const { _id, _creationTime, default_variant_id: _default, is_open: _open, ...stored } = family;
  if (canonicalJson(stored) !== canonicalJson(fields)) {
    await ctx.db.patch(_id, fields);
  }
}

/** A family goes with its single variant when that row is removed outright, such as by account deletion. */
async function deleteOrphanedFamily(ctx: MutationCtx, id: Id<'factions'>) {
  const families = await ctx.db
    .query('faction_families')
    .withIndex('by_default_variant', (q) => q.eq('default_variant_id', id))
    .take(1);
  for (const family of families) {
    await ctx.db.delete(family._id);
  }
}

/** Throws unless the faction is a variant of a family that exists and, while it is the only variant, mirrors it exactly. */
export async function assertFactionFamily(ctx: Pick<QueryCtx, 'db'>, faction: Doc<'factions'>) {
  const family = faction.family_id ? await ctx.db.get(faction.family_id) : null;
  if (!family || !faction.variant_name || !faction.variant_slug) {
    throw new Error(`Faction ${faction._id} has no family`);
  }
  const { _id, _creationTime, default_variant_id: _default, is_open: _open, ...stored } = family;
  if (family.default_variant_id === faction._id && canonicalJson(stored) !== canonicalJson(mirroredFields(faction))) {
    throw new Error(`Faction family ${family._id} does not mirror its variant ${faction._id}`);
  }
}

export function registerFactionFamilyTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    await syncFactionFamily(ctx, change.id, change.newDoc);
  });
}
