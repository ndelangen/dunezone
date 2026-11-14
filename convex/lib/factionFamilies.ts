import type { Triggers } from 'convex-helpers/server/triggers';

import { splitSharedFields } from '../../src/shared/factions/sharedFields';
import { slugify } from '../../src/shared/slugify';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import { allocateVariantAddress } from './factionAddresses';
import type { parseStoredFactionForRead } from './factionInput';
import { parseStoredDataOrNull, takeSharedFields } from './factionVariants';

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
  const data = parseStoredDataOrNull(faction.data);
  return data ? splitSharedFields(data).shared : null;
}

/**
 * Mirrored from the family's default variant: the shared fields every variant holds a copy of, and when it last changed.
 * The rest is the Faction's own (#2910, #2928).
 * Its owner and deletion start as its first variant's, and then change only on the Faction, so choosing another default never hands it to that variant's owner, and deleting a variant never deletes the Faction.
 * Its Group starts as its first variant's too.
 * Nor is the address mirrored: the Faction keeps the one its variant had, and the variant moves to one of its own under it (#2909).
 */
function mirroredFields(faction: Doc<'factions'>) {
  return {
    data: sharedData(faction),
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
    owner_id: faction.owner_id,
    is_deleted: faction.is_deleted,
    created_at: faction.created_at,
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

/** Whether the family already holds what its default variant would mirror onto it. */
function mirrors(family: Doc<'faction_families'>, fields: ReturnType<typeof mirroredFields>) {
  const stored: ReturnType<typeof mirroredFields> = { data: family.data, updated_at: family.updated_at };
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

/** Every variant of the Faction, the soft-deleted ones too, oldest first. */
export function variantsOf(ctx: Pick<QueryCtx, 'db'>, familyId: Id<'faction_families'>) {
  return ctx.db.query('factions').withIndex('by_family', (q) => q.eq('family_id', familyId));
}

/** The most variants one listing of a Faction reads. */
export const VARIANT_LISTING_LIMIT = 200;

/**
 * The Faction's variants in listing order, the soft-deleted ones too, read one at a time so a caller can stop at the first it wants, since a variant's row can be large.
 * The default comes first, then the order its maintainers gave, then any variant that order does not name, oldest first (#2928).
 * @yields Each variant of the Faction, once.
 */
async function* variantsInOrder(ctx: Pick<QueryCtx, 'db'>, family: Doc<'faction_families'>) {
  const seen = new Set<Id<'factions'>>();
  for (const id of [family.default_variant_id, ...(family.variant_order ?? [])]) {
    const row = seen.has(id) ? null : await ctx.db.get('factions', id);
    seen.add(id);
    if (row?.family_id === family._id) {
      yield row;
    }
  }
  for await (const row of variantsOf(ctx, family._id)) {
    if (!seen.has(row._id)) {
      yield row;
    }
  }
}

/**
 * The Faction's live variants in listing order, the default first, at most `VARIANT_LISTING_LIMIT` of them.
 * The limit counts in listing order, so the default and the variants its maintainers ordered are never the ones left out.
 */
export async function liveVariantsInOrder(ctx: Pick<QueryCtx, 'db'>, family: Doc<'faction_families'>) {
  const live: Doc<'factions'>[] = [];
  for await (const row of variantsInOrder(ctx, family)) {
    if (!row.is_deleted) {
      live.push(row);
    }
    if (live.length === VARIANT_LISTING_LIMIT) {
      break;
    }
  }
  return live;
}

/** The first live variant of the Faction in listing order that `accept` takes, or null. */
export async function firstLiveVariant(
  ctx: Pick<QueryCtx, 'db'>,
  family: Doc<'faction_families'>,
  accept: (variant: Doc<'factions'>) => boolean | Promise<boolean>
) {
  for await (const row of variantsInOrder(ctx, family)) {
    if (!row.is_deleted && (await accept(row))) {
      return row;
    }
  }
  return null;
}

/** The most of one owner's Factions a read looks through for those left without a live variant, newest first. */
const EMPTY_FACTION_SCAN_LIMIT = 100;

/**
 * The owner's live Factions that hold no live variant, newest first, each as a row names it.
 * Someone else deleting the last variant of an open Faction leaves one, and only its owner may delete it (#2910).
 * A Faction with a live variant costs one read, since its default is then live.
 */
export async function loadEmptyFactionsOf(ctx: Pick<QueryCtx, 'db'>, ownerId: Id<'users'>) {
  const families = await ctx.db
    .query('faction_families')
    .withIndex('by_owner_deleted', (q) => q.eq('owner_id', ownerId).eq('is_deleted', false))
    .order('desc')
    .take(EMPTY_FACTION_SCAN_LIMIT);
  const live = await Promise.all(families.map((family) => firstLiveVariant(ctx, family, () => true)));
  return families
    .filter((_, index) => !live[index])
    .map(({ _id, slug, data }) => ({
      id: _id,
      slug,
      /* Null while the data of the Faction's last default variant does not parse. */
      data: data ? { name: data.name, emblem: data.emblem, background: data.background } : null,
    }));
}

/**
 * Makes the variant its Faction's default, which the Faction then mirrors.
 * The variant first takes the Faction's shared fields, which a push still on its way may not have brought it, so the mirror never puts older values back.
 */
export async function makeDefaultVariant(ctx: MutationCtx, family: Doc<'faction_families'>, variant: Doc<'factions'>) {
  await takeSharedFields(ctx, family.data, variant);
  const current = (await ctx.db.get(variant._id))!;
  await ctx.db.patch(family._id, { default_variant_id: variant._id, ...mirroredFields(current) });
}

/** Whether the Faction's default is a live variant of it. */
async function hasLiveDefault(ctx: MutationCtx, family: Doc<'faction_families'>) {
  const current = await ctx.db.get(family.default_variant_id);
  return !!current && !current.is_deleted && current.family_id === family._id;
}

/**
 * A live variant that comes into a Faction makes it whole again: it becomes the default when the Faction has no live one, and a Faction deleted for want of a live variant comes back.
 * A branch still on its way after an eviction arrives like this when the variant evicted ahead of it has since been deleted (#2911).
 */
export async function takeInLiveVariant(ctx: MutationCtx, familyId: Id<'faction_families'>, variant: Doc<'factions'>) {
  const family = await ctx.db.get(familyId);
  if (!family || variant.is_deleted) {
    return;
  }
  if (family.is_deleted) {
    await ctx.db.patch(family._id, { is_deleted: false });
  }
  if (!(await hasLiveDefault(ctx, family))) {
    await makeDefaultVariant(ctx, family, variant);
  }
}

/** Passes the Faction's default on to its first other live variant, when `leaving` is the default and there is one. */
export async function passDefaultOn(ctx: MutationCtx, family: Doc<'faction_families'>, leaving: Id<'factions'>) {
  const next =
    family.default_variant_id === leaving ? await firstLiveVariant(ctx, family, (row) => row._id !== leaving) : null;
  if (next) {
    await makeDefaultVariant(ctx, family, next);
  }
}

/**
 * Keeps a Faction's default variant live while it has any live variant, in the transaction that changes one (#2928).
 * A deleted default passes to the first live variant, so the Faction's address and its former ones keep leading somewhere;
 * a variant that comes back becomes the default of a Faction left with no live one.
 */
async function keepDefaultLive(ctx: MutationCtx, before: Doc<'factions'> | null, after: Doc<'factions'> | null) {
  if (!after?.family_id || (before?.is_deleted ?? false) === after.is_deleted) {
    return;
  }
  const family = await ctx.db.get(after.family_id);
  if (!family) {
    return;
  }
  if (after.is_deleted) {
    await passDefaultOn(ctx, family, after._id);
    return;
  }
  if (!(await hasLiveDefault(ctx, family))) {
    await makeDefaultVariant(ctx, family, after);
  }
}

export function registerFactionFamilyTriggers(triggers: Triggers<DataModel, MutationCtx>) {
  triggers.register('factions', async (ctx, change) => {
    await keepDefaultLive(ctx, change.oldDoc, change.newDoc);
    await syncFactionFamily(ctx, change.id, change.newDoc);
  });
}
