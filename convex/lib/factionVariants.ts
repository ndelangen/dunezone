import { ConvexError } from 'convex/values';

import { splitSharedFields } from '../../src/shared/factions/sharedFields';
import {
  INHERITABLE_FIELDS,
  normalizeInheritedFields,
  resolveVariantData,
  variantProblems,
} from '../../src/shared/factions/variantFields';
import type { InheritableField } from '../../src/shared/factions/variantFields';
import { slugify } from '../../src/shared/slugify';
import { internal } from '../_generated/api';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import { factionInputForWrite, parseStoredFactionForRead } from './factionInput';
import {
  enqueueFactionFaces,
  enqueueFactionLeaderPublications,
  enqueueFactionSheetPublication,
  enqueueFactionTokenPublication,
} from './publication';
import { nowIso } from './utils';

type StoredFaction = ReturnType<typeof parseStoredFactionForRead>;

/** The most variants a Faction's page lists for choosing a parent. */
const VARIANT_LIST_LIMIT = 200;

/** The name a variant goes by; one made before variants had names is the Original. */
function variantName(variant: Doc<'factions'>) {
  return variant.variant_name ?? 'Original';
}

/** The live variants of a Faction, oldest first: what its pages offer as the parent of a new variant (#2927). */
export async function listFamilyVariants(ctx: QueryCtx, familyId: Id<'faction_families'> | undefined) {
  if (!familyId) {
    return [];
  }
  const rows = await ctx.db
    .query('factions')
    .withIndex('by_family', (q) => q.eq('family_id', familyId))
    .take(VARIANT_LIST_LIMIT);
  return rows
    .filter((row) => !row.is_deleted)
    .map((row) => ({ _id: row._id, slug: row.slug, name: variantName(row), parent_id: row.parent_id ?? null }));
}

/**
 * The parent a variant follows, with its current data, which the editor shows read-only for each inherited field.
 * A soft-deleted parent still answers, since its children keep following it (#2908).
 */
export async function parentVariantFacts(ctx: QueryCtx, variant: Doc<'factions'>) {
  const parent = variant.parent_id ? await ctx.db.get(variant.parent_id) : null;
  if (!parent) {
    return null;
  }
  return {
    _id: parent._id,
    slug: parent.slug,
    name: variantName(parent),
    data: parseStoredFactionForRead(parent.data),
  };
}

/** The fields a variant follows its parent in: what the save names, else what it followed before. */
export function inheritedFields(faction: Doc<'factions'>, proposed?: readonly string[]): InheritableField[] {
  return faction.parent_id ? normalizeInheritedFields(proposed ?? faction.inherited ?? []) : [];
}

/**
 * The proposed data with each inherited field taken from the parent's current data, so a variant never stores a stale copy.
 * A variant without a parent follows nothing, and naming fields for it to follow is refused.
 */
export async function withInheritedFields(
  ctx: MutationCtx,
  faction: Doc<'factions'>,
  proposedData: unknown,
  proposedInherited: readonly string[] | undefined
) {
  if (!faction.parent_id) {
    if (proposedInherited?.length) {
      throw new ConvexError('Only a variant with a parent variant can use its parent’s fields.');
    }
    return proposedData;
  }
  const parent = await ctx.db.get(faction.parent_id);
  if (!parent) {
    throw new Error(`Parent variant ${faction.parent_id} not found`);
  }
  const proposed = factionInputForWrite(proposedData, faction.data) as StoredFaction;
  return resolveVariantData(
    parseStoredFactionForRead(parent.data),
    proposed,
    inheritedFields(faction, proposedInherited)
  );
}

/**
 * Stores a variant's resolved data the way every save does: its publications follow, and its children and their children follow it.
 * The revision lets a push-down that a newer save overtook stop.
 */
export async function storeVariantData(
  ctx: MutationCtx,
  faction: Doc<'factions'>,
  data: StoredFaction,
  fields: Partial<Pick<Doc<'factions'>, 'slug' | 'inherited'>> = {}
) {
  const revision = (faction.revision ?? 0) + 1;
  await ctx.db.patch(faction._id, {
    ...fields,
    data,
    revision,
    updated_at: nowIso(),
    ...(faction.parent_id || faction.problems ? { problems: variantProblems(data) } : {}),
  });
  const updated = (await ctx.db.get(faction._id))!;
  await enqueueFactionSheetPublication(ctx, updated);
  await enqueueFactionTokenPublication(ctx, updated, faction.data);
  await enqueueFactionLeaderPublications(ctx, updated, faction.data);
  await enqueueFactionFaces(ctx, updated, faction.data);
  await pushToChildren(ctx, faction._id, revision);
  return updated;
}

/** Starts the push-down to the variant's children, one child per transaction (#2907), when it has any. */
async function pushToChildren(ctx: MutationCtx, parentId: Id<'factions'>, revision: number) {
  const child = await ctx.db
    .query('factions')
    .withIndex('by_parent', (q) => q.eq('parent_id', parentId))
    .first();
  if (child) {
    await ctx.scheduler.runAfter(0, internal.factionVariants.pushToChildren, { parentId, revision, cursor: null });
  }
}

/** Brings one child up to its parent's current data; a child that already follows it is left alone. */
export async function followParent(ctx: MutationCtx, parent: Doc<'factions'>, child: Doc<'factions'>) {
  const current = parseStoredFactionForRead(child.data);
  const resolved = resolveVariantData(parseStoredFactionForRead(parent.data), current, inheritedFields(child));
  if (canonicalJson(resolved) !== canonicalJson(current)) {
    await storeVariantData(ctx, child, resolved);
  }
}

/**
 * Records a save's shared fields on its Faction and starts carrying them to every variant (#2905).
 * Each push reads the Faction's current values, so an older push that runs late carries the newer save's values, never its own.
 */
export async function pushSharedFields(ctx: MutationCtx, faction: Doc<'factions'>) {
  if (!faction.family_id) {
    return;
  }
  const { shared } = splitSharedFields(parseStoredFactionForRead(faction.data));
  await ctx.db.patch(faction.family_id, { data: shared });
  await ctx.scheduler.runAfter(0, internal.factionVariants.pushSharedFields, {
    familyId: faction.family_id,
    cursor: null,
  });
}

/** Gives one variant its Faction's current shared fields; a variant that already has them is left alone. */
export async function takeSharedFields(ctx: MutationCtx, family: Doc<'faction_families'>, variant: Doc<'factions'>) {
  const current = parseStoredFactionForRead(variant.data);
  const next = { ...current, ...family.data };
  if (family.data && canonicalJson(next) !== canonicalJson(current)) {
    await storeVariantData(ctx, variant, next);
  }
}

/**
 * A new variant of the faction `base` belongs to, owned by its creator.
 * With a parent it follows that parent in every field;
 * without one it starts as a copy of `base` with fields of its own.
 */
export async function insertVariant(
  ctx: MutationCtx,
  {
    base,
    parent,
    name,
    ownerId,
    groupId,
    address,
  }: {
    base: Doc<'factions'>;
    parent: Doc<'factions'> | null;
    name: string;
    ownerId: Id<'users'>;
    groupId: Id<'groups'> | null;
    address: string;
  }
) {
  const source = parseStoredFactionForRead((parent ?? base).data);
  const now = nowIso();
  const id = await ctx.db.insert('factions', {
    owner_id: ownerId,
    group_id: groupId,
    data: source,
    slug: address,
    created_at: now,
    updated_at: now,
    is_deleted: false,
    family_id: base.family_id,
    variant_name: name,
    variant_slug: slugify(name),
    revision: 0,
    ...(parent ? { parent_id: parent._id, inherited: [...INHERITABLE_FIELDS], problems: variantProblems(source) } : {}),
  });
  const row = (await ctx.db.get(id))!;
  await enqueueFactionSheetPublication(ctx, row);
  await enqueueFactionTokenPublication(ctx, row);
  await enqueueFactionLeaderPublications(ctx, row);
  await enqueueFactionFaces(ctx, row);
  return row;
}
