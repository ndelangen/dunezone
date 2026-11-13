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
import type { MutationCtx } from '../_generated/server';
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
    ...(faction.parent_id ? { problems: variantProblems(data) } : {}),
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

/** Starts carrying a save's shared fields to every other variant of its Faction (#2905). */
export async function pushSharedFields(ctx: MutationCtx, faction: Doc<'factions'>) {
  if (faction.family_id) {
    await ctx.scheduler.runAfter(0, internal.factionVariants.pushSharedFields, {
      sourceId: faction._id,
      cursor: null,
    });
  }
}

/** Gives one variant the shared fields its sibling saved; a variant that already has them is left alone. */
export async function takeSharedFields(ctx: MutationCtx, source: Doc<'factions'>, variant: Doc<'factions'>) {
  const { shared } = splitSharedFields(parseStoredFactionForRead(source.data));
  const current = parseStoredFactionForRead(variant.data);
  const next = { ...current, ...shared };
  if (canonicalJson(next) !== canonicalJson(current)) {
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
    ...(parent ? { parent_id: parent._id, inherited: [...INHERITABLE_FIELDS], problems: [] } : {}),
  });
  const row = (await ctx.db.get(id))!;
  await enqueueFactionSheetPublication(ctx, row);
  await enqueueFactionTokenPublication(ctx, row);
  await enqueueFactionLeaderPublications(ctx, row);
  await enqueueFactionFaces(ctx, row);
  return row;
}
