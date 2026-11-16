import type { Triggers } from 'convex-helpers/server/triggers';
import type { WithoutSystemFields } from 'convex/server';

import { splitSharedFields } from '../../src/shared/factions/sharedFields';
import { slugify } from '../../src/shared/slugify';
import type { DataModel, Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import { canonicalJson } from './canonicalJson';
import { ALL_PARTITION } from './catalogueOrder';
import { allocateFactionAddress } from './factionAddresses';
import type { parseStoredFactionForRead } from './factionInput';
import { parseStoredDataOrNull, takeSharedFields } from './factionVariants';

/** The variant name a faction gets when no live ruleset links it. */
export const ORIGINAL_VARIANT_NAME = 'Original';
const ORIGINAL_VARIANT_SLUG = slugify(ORIGINAL_VARIANT_NAME);

/**
 * What a paging picker calls a variant: its name where its Faction has several live variants to tell apart, else null.
 * A page cannot count its own siblings, so the count is read off the Faction's catalogue entry, which holds it without reading the variants (#2929).
 * A variant whose Faction is not listed stands alone.
 */
export async function pickerVariantLabel(ctx: QueryCtx, variant: Doc<'factions'>) {
  const familyId = variant.family_id;
  const entry = await ctx.db
    .query('catalogue_entries')
    .withIndex('by_kind_source', (q) =>
      q.eq('kind', 'faction_family').eq('source_id', familyId).eq('partition', ALL_PARTITION)
    )
    .first();
  return (entry?.variant_count ?? 1) > 1 ? variant.variant_name : null;
}

/* The query is public, so the seats it reads for a page are capped; a tool seats no more than this. */
const MOST_SEATS = 24;

/** The variants a tool has seated, read once for a page of choices; an id that is no faction's is passed over. */
export async function seatedVariants(ctx: QueryCtx, seated: readonly string[]) {
  const variants = await Promise.all(
    seated.slice(0, MOST_SEATS).map(async (id) => {
      const factionId = ctx.db.normalizeId('factions', id);
      return factionId ? await ctx.db.get('factions', factionId) : null;
    })
  );
  return variants.filter((variant) => variant !== null);
}

/**
 * The name of the seated variant that keeps this one from the table: another variant of its Faction, since a tool seats one variant per Faction.
 * Null where no sibling is seated.
 */
export function seatedSiblingName(seated: readonly Doc<'factions'>[], variant: Doc<'factions'>) {
  const sibling = seated.find((other) => other.family_id === variant.family_id && other._id !== variant._id);
  return sibling?.variant_name ?? null;
}

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

/**
 * Mirrored from the family's default variant: the shared fields every variant holds a copy of, and when it last changed.
 * The shared fields are null while the variant's data does not parse, so a broken legacy faction never blocks its own write.
 * The rest is the Faction's own (#2910, #2928).
 * Its owner and deletion start as its first variant's, and then change only on the Faction, so choosing another default never hands it to that variant's owner, and deleting a variant never deletes the Faction.
 * Its Group starts as its first variant's too.
 * Nor is the address mirrored: the Faction keeps the one its variant had, and the variant moves to one of its own under it (#2909).
 */
function mirroredFields(faction: Pick<Doc<'factions'>, 'data' | 'updated_at'>) {
  const data = parseStoredDataOrNull(faction.data);
  return {
    data: data ? splitSharedFields(data).shared : null,
    updated_at: faction.updated_at,
  };
}

type NewFaction = Omit<WithoutSystemFields<Doc<'factions'>>, 'family_id' | 'variant_name' | 'variant_slug'>;

/**
 * Creates a Faction at the address `slug` with its first variant, the Original, under it (#2933).
 * The Faction comes first, without a default, so the variant is written with its Faction from the start;
 * the variant then becomes the default, whose shared fields the Faction already holds.
 */
export async function insertFaction(ctx: MutationCtx, { slug, ...fields }: NewFaction) {
  const familyId = await ctx.db.insert('faction_families', {
    ...mirroredFields(fields),
    owner_id: fields.owner_id,
    is_deleted: fields.is_deleted,
    created_at: fields.created_at,
    slug,
    group_id: fields.group_id,
    is_open: false,
  });
  const id = await ctx.db.insert('factions', {
    ...fields,
    slug: await allocateFactionAddress(ctx, `${slug}-${ORIGINAL_VARIANT_SLUG}`),
    family_id: familyId,
    variant_name: ORIGINAL_VARIANT_NAME,
    variant_slug: ORIGINAL_VARIANT_SLUG,
  });
  const row = (await ctx.db.get(id))!;
  await ctx.db.patch(familyId, { default_variant_id: id });
  return row;
}

/**
 * Brings a faction's family up to date with its default variant;
 * rerunning it on an unchanged faction writes nothing.
 */
export async function syncFactionFamily(ctx: MutationCtx, id: Id<'factions'>, faction: Doc<'factions'> | null) {
  if (!faction) {
    await deleteOrphanedFamily(ctx, id);
    return;
  }
  const family = await ctx.db.get(faction.family_id);
  if (family?.default_variant_id !== faction._id) {
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
type SeedFaction = NewFaction & Partial<Pick<Doc<'factions'>, 'family_id' | 'variant_name' | 'variant_slug'>>;

/**
 * Writes a seeded faction, such as one in the Storybook baseline: one that names no Faction is made with one, as `factions.create` makes it, and a variant with a parent joins its parent's.
 * The Faction is made with its first variant, so no seed can name it.
 */
export async function insertSeedFaction(ctx: MutationCtx, faction: SeedFaction) {
  const { family_id, variant_name, variant_slug, parent_id } = faction;
  if (family_id && variant_name && variant_slug) {
    return await ctx.db.insert('factions', { ...faction, family_id, variant_name, variant_slug });
  }
  if (!parent_id) {
    return (await insertFaction(ctx, faction))._id;
  }
  const parent = await ctx.db.get(parent_id);
  if (!parent || !variant_name || !variant_slug) {
    throw new Error(`A seeded variant of ${parent_id} needs its parent and its own name and slug`);
  }
  return await ctx.db.insert('factions', { ...faction, family_id: parent.family_id, variant_name, variant_slug });
}

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
  const family = await ctx.db.get(faction.family_id);
  if (!family) {
    throw new Error(`Faction ${faction._id} has no family`);
  }
  assertMirrorsDefaultVariant(family, faction);
}

/** Throws when the faction is its family's default variant and the family no longer mirrors it. */
function assertMirrorsDefaultVariant(family: Doc<'faction_families'>, faction: Doc<'factions'>) {
  if (family.default_variant_id === faction._id && !mirrors(family, mirroredFields(faction))) {
    throw new Error(`Faction family ${family._id} does not mirror its variant ${faction._id}`);
  }
}

/** The Faction's default variant, which every Faction has once `insertFaction` returns. */
export function defaultVariantOf(family: Doc<'faction_families'>) {
  if (!family.default_variant_id) {
    throw new Error(`Faction ${family._id} has no default variant`);
  }
  return family.default_variant_id;
}

/** The variants a listing of the Faction reads first: its default, then the order its maintainers gave. */
export function listedFirst(family: Doc<'faction_families'>) {
  return [...(family.default_variant_id ? [family.default_variant_id] : []), ...(family.variant_order ?? [])];
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
  for (const id of listedFirst(family)) {
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
  const current = family.default_variant_id ? await ctx.db.get(family.default_variant_id) : null;
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
  if (!after || (before?.is_deleted ?? false) === after.is_deleted) {
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
