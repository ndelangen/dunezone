import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { INHERITABLE_FIELDS, resolveVariantData } from '../src/shared/factions/variantFields';
import { rulebookSettingsSchema } from '../src/shared/rulebooks/settings';
import { slugify } from '../src/shared/slugify';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { withNexusFaction } from './assets';
import { adminQuery, internalMutation, mutation } from './functions';
import { allocateVariantAddress } from './lib/factionAddresses';
import { variantsOf } from './lib/factionFamilies';
import { parseStoredFactionForRead } from './lib/factionInput';
import { inBranchOf, moveChildrenLater, moveToFamily, storeVariantData } from './lib/factionVariants';
import { recordFormerSlug } from './lib/formerSlugs';
import { requireAdminUserId } from './lib/policy';
import { enqueueAssetPublication } from './lib/publication';
import {
  rulebookAuthoredHash,
  rulebookDraftContentsHash,
  rulebookEditionContentsHash,
} from './lib/rulebookEditionContents';
import {
  followedPairs,
  idMapFor,
  idPairsByField,
  isEmptyIdMap,
  matchingFields,
  rewriteComponentReferences,
} from './lib/variantMerge';
import type { ComponentIdMap, IdPairsByField } from './lib/variantMerge';
import type { MutationCtx, QueryCtx } from './types';

/*
 * The admin merge tool (#2932): puts a variant, with its whole branch, under a parent in a Faction (#2914).
 * A variant from another Faction merges into it;
 * a variant of that Faction is re-parented (#2908).
 * Each field whose content equals the parent's, ids aside, switches to Use parent variant, and every reference to the ids it gives up is rewritten.
 */

/** Where a variant goes: the Faction it joins and the parent it follows there. */
const placeArgs = {
  faction_id: v.id('factions'),
  family_id: v.id('faction_families'),
  parent_id: v.union(v.id('factions'), v.null()),
};

const attachArgs = {
  ...placeArgs,
  /** The variant's name in the Faction it joins; its current name when left out. */
  name: v.optional(v.string()),
};

type AttachArgs = {
  faction_id: Id<'factions'>;
  family_id: Id<'faction_families'>;
  parent_id: Id<'factions'> | null;
  name?: string;
};
type Reader = Pick<QueryCtx, 'db'>;

/** The leader and troop fields, whose ids a variant gives up when it starts following them. */
const ID_FIELDS = ['factionLeader', 'leaders', 'troops'] as const;

/** The variant and every variant below it, live or deleted, parents before children. */
async function branchOf(ctx: Reader, root: Doc<'factions'>) {
  const branch = [root];
  const seen = new Set([root._id]);
  for (let index = 0; index < branch.length; index += 1) {
    for await (const child of ctx.db
      .query('factions')
      .withIndex('by_parent', (q) => q.eq('parent_id', branch[index]!._id))) {
      if (!seen.has(child._id)) {
        seen.add(child._id);
        branch.push(child);
      }
    }
  }
  return branch;
}

/** The id map of each row of the branch whose leader or troop ids change: the root's own pairs, then each descendant's for the fields it follows. */
function branchMaps(branch: readonly Doc<'factions'>[], rootPairs: IdPairsByField) {
  const pairs = new Map<Id<'factions'>, IdPairsByField>();
  const maps = new Map<Id<'factions'>, ComponentIdMap>();
  for (const [index, row] of branch.entries()) {
    const byField = index === 0 ? rootPairs : followedPairs(pairs.get(row.parent_id!) ?? {}, row.inherited ?? []);
    pairs.set(row._id, byField);
    const map = idMapFor(byField);
    if (!isEmptyIdMap(map)) {
      maps.set(row._id, map);
    }
  }
  return maps;
}

/** Refuses with `message` unless `holds`. */
function refuseUnless(holds: unknown, message: string): asserts holds {
  if (!holds) {
    throw new ConvexError(message);
  }
}

/** The parent an attach names, or null for none; refused unless it is a live variant of the target outside the moving branch. */
async function attachParent(ctx: Reader, args: AttachArgs, variantId: Id<'factions'>) {
  if (!args.parent_id) {
    return null;
  }
  const parent = await ctx.db.get('factions', args.parent_id);
  refuseUnless(isLiveVariantOf(parent, args.family_id), 'The parent must be a live variant of the faction it joins.');
  refuseUnless(!(await inBranchOf(
    ctx,
    args.parent_id,
    variantId
  )), 'A variant cannot sit under itself or one of its own variants.');
  return parent;
}

/** The rows an attach names, refused where the attach may not happen. */
async function attachRows(ctx: Reader, args: AttachArgs) {
  const variant = await ctx.db.get('factions', args.faction_id);
  refuseUnless(variant, 'That variant no longer exists.');
  const target = await ctx.db.get('faction_families', args.family_id);
  refuseUnless(target && !target.is_deleted, 'That faction no longer exists.');
  const parent = await attachParent(ctx, args, variant._id);
  const name = args.name?.trim() ?? variant.variant_name;
  refuseUnless(slugify(name), 'Give the variant a name.');
  return { variant, target, parent, name };
}

function isLiveVariantOf(row: Doc<'factions'> | null, familyId: Id<'faction_families'>) {
  return !!row && !row.is_deleted && row.family_id === familyId;
}

/** The variants a Faction keeps when `branch` leaves it: whether any is live, and how many are deleted. */
async function leftBehind(ctx: Reader, familyId: Id<'faction_families'>, inBranch: ReadonlySet<Id<'factions'>>) {
  let live = false;
  let deleted = 0;
  for await (const row of variantsOf(ctx, familyId)) {
    if (!inBranch.has(row._id)) {
      live ||= !row.is_deleted;
      deleted += row.is_deleted ? 1 : 0;
    }
  }
  return { live, deleted };
}

/** The branch rows with the names they will have, each marked when the target or another row of the branch already has it. */
function withNameClashes(branch: readonly Doc<'factions'>[], rootName: string, takenSlugs: ReadonlySet<string>) {
  const named = branch.map((row, index) => ({ row, name: index === 0 ? rootName : row.variant_name }));
  const counts = new Map<string, number>();
  for (const { name } of named) {
    counts.set(slugify(name), (counts.get(slugify(name)) ?? 0) + 1);
  }
  return named.map((entry) => {
    const slug = slugify(entry.name);
    return { ...entry, nameClash: takenSlugs.has(slug) || (counts.get(slug) ?? 0) > 1 };
  });
}

/**
 * Everything an attach would change, refused where it may not happen: what the merge preview shows and the merge does.
 * `maps` holds the id pairs of each row whose leader or troop ids change: the variant, and each variant below it that follows it in those fields.
 */
async function planAttach(ctx: Reader, args: AttachArgs) {
  const { variant, target, parent, name } = await attachRows(ctx, args);
  const data = parseStoredFactionForRead(variant.data);
  const parentData = parent ? parseStoredFactionForRead(parent.data) : null;
  const fields = parentData ? matchingFields(parentData, data) : [];
  const branch = await branchOf(ctx, variant);
  const inBranch = new Set(branch.map((row) => row._id));
  const takenSlugs = new Set<string>();
  for await (const row of variantsOf(ctx, target._id)) {
    if (!inBranch.has(row._id)) {
      takenSlugs.add(row.variant_slug);
    }
  }
  const moves = variant.family_id !== target._id;
  const left = moves ? await leftBehind(ctx, variant.family_id, inBranch) : { live: true, deleted: 0 };
  return {
    variant,
    name,
    target,
    parent,
    source: await ctx.db.get('faction_families', variant.family_id),
    fields,
    moves,
    branch: withNameClashes(branch, name, takenSlugs),
    /* The same pairs `attach` reads off what it stored, including a leader `resolveVariantData` gives a fresh identity. */
    maps: branchMaps(
      branch,
      parentData ? idPairsByField(resolveVariantData(parentData, data, fields), data, ID_FIELDS) : {}
    ),
    /** Whether the variant's Faction is left with no live variant, so it retires into the one it joins. */
    retiresSource: !left.live,
    /** The deleted variants that stay in a Faction that retires, unless they are merged too. */
    deletedLeftBehind: left.live ? 0 : left.deleted,
  };
}

/**
 * What a merge would do, for the admin to check before running it (#2914).
 * The references it rewrites are listed by `referencePreview`, a page at a time.
 * It takes no name, so typing one does not ask again: the page checks the variant's new name against the slugs `variants` lists, and the merge refuses a clash either way.
 * `nameClash` is therefore about the name each variant has now, which is the one a variant below the moving one keeps.
 */
export const preview = adminQuery({
  args: placeArgs,
  returns: v.object({
    followed: v.array(v.string()),
    custom: v.array(v.string()),
    branch: v.array(
      v.object({
        _id: v.id('factions'),
        name: v.string(),
        isDeleted: v.boolean(),
        changesIds: v.boolean(),
        nameClash: v.boolean(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const plan = await planAttach(ctx, args);
    return {
      followed: plan.fields,
      custom: plan.parent ? INHERITABLE_FIELDS.filter((field) => !plan.fields.includes(field)) : [],
      branch: plan.branch.map(({ row, name, nameClash }) => ({
        _id: row._id,
        name,
        isDeleted: row.is_deleted,
        changesIds: plan.maps.has(row._id),
        nameClash,
      })),
    };
  },
});

/**
 * A Faction's variants, the deleted ones too, each with its parent: what the merge page offers to move and to move under.
 * The switcher lists only live variants, and a merge has to say which deleted ones stay behind.
 * Null for an unknown variant or one whose Faction is deleted.
 */
export const variants = adminQuery({
  args: { faction_id: v.id('factions') },
  returns: v.union(
    v.null(),
    v.object({
      familyId: v.id('faction_families'),
      name: v.string(),
      defaultVariantId: v.union(v.id('factions'), v.null()),
      variants: v.array(
        v.object({
          _id: v.id('factions'),
          name: v.string(),
          /** The name as its address says it, which no other variant of the Faction may share. */
          slug: v.string(),
          parentId: v.union(v.id('factions'), v.null()),
          isDeleted: v.boolean(),
        })
      ),
    })
  ),
  handler: async (ctx, args) => {
    const variant = await ctx.db.get('factions', args.faction_id);
    const family = variant && (await ctx.db.get('faction_families', variant.family_id));
    if (!family || family.is_deleted) {
      return null;
    }
    const rows = [];
    for await (const row of variantsOf(ctx, family._id)) {
      rows.push({
        _id: row._id,
        name: row.variant_name,
        slug: row.variant_slug,
        parentId: row.parent_id ?? null,
        isDeleted: row.is_deleted,
      });
    }
    return {
      familyId: family._id,
      name: family.data?.name ?? family.slug,
      defaultVariantId: family.default_variant_id ?? null,
      variants: rows,
    };
  },
});

/** The serialisable form of the maps, which the rewrite carries from transaction to transaction. */
const mapsValidator = v.array(
  v.object({
    factionId: v.id('factions'),
    members: v.record(v.string(), v.string()),
    troops: v.record(v.string(), v.string()),
  })
);

/** The documents a merge rewrites references in: each Rulebook's saved draft, then each Edition's Contents. */
const documentsValidator = v.union(v.literal('drafts'), v.literal('editions'));
type Documents = typeof documentsValidator.type;

/** One page of drafts or Edition Contents, each with the value its references rewrite to and how many it rewrote. */
async function documentPage(
  ctx: Reader,
  documents: Documents,
  maps: ReadonlyMap<string, ComponentIdMap>,
  paginationOpts: { cursor: string | null; numItems: number }
) {
  const page =
    documents === 'drafts'
      ? await ctx.db.query('rulebook_drafts').paginate(paginationOpts)
      : await ctx.db.query('rulebook_edition_contents').paginate(paginationOpts);
  return {
    ...page,
    page: page.page.map((row: Doc<'rulebook_drafts'> | Doc<'rulebook_edition_contents'>) => ({
      row,
      ...rewriteComponentReferences(row.contents, maps),
    })),
  };
}

/** The drafts or Editions a merge rewrites references in, a page at a time; pages may come back empty. */
export const referencePreview = adminQuery({
  args: { ...attachArgs, documents: documentsValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({ rulebookName: v.string(), edition: v.union(v.number(), v.null()), references: v.number() })
  ),
  handler: async (ctx, { paginationOpts, documents, ...args }) => {
    const { maps } = await planAttach(ctx, args);
    const page = await documentPage(ctx, documents, maps, paginationOpts);
    const rows = [];
    for (const { row, rewritten } of page.page) {
      if (rewritten) {
        const edition = 'edition_id' in row ? await ctx.db.get('rulebook_editions', row.edition_id) : null;
        const rulebookId = 'rulebook_id' in row ? row.rulebook_id : edition?.rulebook_id;
        const rulebook = rulebookId ? await ctx.db.get('rulebooks', rulebookId) : null;
        rows.push({
          rulebookName: rulebook?.name ?? 'Unknown rulebook',
          edition: edition?.edition_number ?? null,
          references: rewritten,
        });
      }
    }
    return { ...page, page: rows };
  },
});

/** Gives the variant a new name within its Faction, at an address that says it, and leads its old address there. */
async function renameVariant(
  ctx: MutationCtx,
  variant: Doc<'factions'>,
  family: Doc<'faction_families'>,
  name: string
) {
  const variantSlug = slugify(name);
  const slug = await allocateVariantAddress(ctx, family.slug, variant._id, variantSlug);
  if (slug !== variant.slug) {
    await recordFormerSlug(ctx, { kind: 'faction', scope: '', slug: variant.slug, record_id: variant._id });
  }
  await ctx.db.patch('factions', variant._id, { variant_name: name, variant_slug: variantSlug, slug });
}

/**
 * Merges the variant, with its branch, into the Faction under the parent, or re-parents it within its own Faction (#2932).
 * Only admins may run it;
 * it is a production write the preview shows first.
 * The variant takes the parent's ids in every field it now follows;
 * its branch follows one variant per transaction, and the references to the old ids are rewritten after it.
 * A Faction left with no live variant retires into the one it joined: its addresses and its Nexus cards lead there.
 */
export const attach = mutation({
  args: attachArgs,
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const plan = await planAttach(ctx, args);
    const clash = plan.branch.find((entry) => entry.nameClash);
    if (clash) {
      throw new ConvexError(`The faction already has a variant called “${clash.name}”.`);
    }
    const before = parseStoredFactionForRead(plan.variant.data);
    const link = { parent_id: plan.parent?._id, inherited: plan.parent ? plan.fields : undefined };
    if (plan.moves) {
      await ctx.db.patch('factions', plan.variant._id, { variant_name: plan.name, variant_slug: slugify(plan.name) });
      await moveToFamily(ctx, (await ctx.db.get('factions', plan.variant._id))!, plan.target, link);
    } else {
      await ctx.db.patch('factions', plan.variant._id, link);
      if (plan.name !== plan.variant.variant_name) {
        await renameVariant(ctx, plan.variant, plan.target, plan.name);
      }
    }
    const placed = (await ctx.db.get('factions', plan.variant._id))!;
    const data = parseStoredFactionForRead(placed.data);
    const stored = await storeVariantData(
      ctx,
      placed,
      plan.parent ? resolveVariantData(parseStoredFactionForRead(plan.parent.data), data, plan.fields) : data
    );
    if (plan.moves) {
      await moveChildrenLater(ctx, placed._id);
    }
    if (plan.retiresSource && plan.source) {
      await ctx.db.patch('faction_families', plan.source._id, { is_deleted: true, merged_into: plan.target._id });
    }
    /* The ids are read off what was stored, which also catches a leader `resolveVariantData` gave a fresh identity. */
    const maps = branchMaps(
      plan.branch.map(({ row }) => row),
      idPairsByField(parseStoredFactionForRead(stored.data), before, ID_FIELDS)
    );
    const retiredFamilyId = plan.retiresSource ? plan.source?._id : undefined;
    if (maps.size || retiredFamilyId) {
      await ctx.scheduler.runAfter(0, internal.factionMerge.rewriteReferences, {
        maps: [...maps].map(([factionId, map]) => ({ factionId, ...map })),
        retiredFamilyId,
        phase: maps.size ? 'drafts' : 'nexus',
        cursor: null,
      });
    }
    return { slug: stored.slug };
  },
});

/** The authored hash of rewritten Contents, under the settings saved beside them; none where those do not parse. */
function authoredHash(settings: unknown, contentsHash: string | undefined) {
  const parsed = rulebookSettingsSchema.safeParse(settings);
  return parsed.success ? rulebookAuthoredHash(parsed.data, contentsHash) : undefined;
}

/**
 * Rewrites the references a merge left pointing at old leader and troop ids, one draft or Edition per transaction (#2914).
 * A draft's revision moves on, so an editor holding it reloads;
 * an Edition's Contents and hashes change together, so it still compares equal to the draft it was published from.
 * Then, when the merge retired a Faction, its Nexus cards are saved again through the Nexus writer, which leads them to the Faction it joined.
 */
export const rewriteReferences = internalMutation({
  args: {
    maps: mapsValidator,
    retiredFamilyId: v.optional(v.id('faction_families')),
    phase: v.union(documentsValidator, v.literal('nexus')),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const next =
      args.phase === 'nexus' ? await nexusStep(ctx, args) : await documentsStep(ctx, { ...args, phase: args.phase });
    if (next) {
      await ctx.scheduler.runAfter(0, internal.factionMerge.rewriteReferences, { ...args, ...next });
    }
    return null;
  },
});

type RewriteStep = { phase: 'drafts' | 'editions' | 'nexus'; cursor: string | null };
type RewriteArgs = {
  maps: Array<{ factionId: string } & ComponentIdMap>;
  retiredFamilyId?: Id<'faction_families'>;
  cursor: string | null;
};

/** Rewrites one draft or Edition; the step after it. */
async function documentsStep(
  ctx: MutationCtx,
  args: RewriteArgs & { phase: 'drafts' | 'editions' }
): Promise<RewriteStep | null> {
  const maps = new Map(args.maps.map(({ factionId, ...map }) => [factionId, map]));
  const page = await documentPage(ctx, args.phase, maps, { cursor: args.cursor, numItems: 1 });
  for (const { row, value, rewritten } of page.page) {
    if (rewritten) {
      await saveRewritten(ctx, row, value);
    }
  }
  if (!page.isDone) {
    return { phase: args.phase, cursor: page.continueCursor };
  }
  if (args.phase === 'drafts') {
    return { phase: 'editions', cursor: null };
  }
  return args.retiredFamilyId ? { phase: 'nexus', cursor: null } : null;
}

/** Relinks a page of the retired Faction's Nexus cards; the step after it. */
async function nexusStep(ctx: MutationCtx, args: RewriteArgs): Promise<RewriteStep | null> {
  const cursor = args.retiredFamilyId ? await relinkNexusCards(ctx, args.retiredFamilyId, args.cursor) : null;
  return cursor ? { phase: 'nexus', cursor } : null;
}

/** Saves rewritten Contents: a draft's revision moves on; an Edition's hashes follow its Contents. */
async function saveRewritten(
  ctx: MutationCtx,
  row: Doc<'rulebook_drafts'> | Doc<'rulebook_edition_contents'>,
  value: unknown
) {
  if ('rulebook_id' in row) {
    const contentsHash = rulebookDraftContentsHash(value);
    const rulebook = await ctx.db.get('rulebooks', row.rulebook_id);
    await ctx.db.patch('rulebook_drafts', row._id, {
      contents: value,
      revision: row.revision + 1,
      contents_hash: contentsHash,
      authored_hash: authoredHash(rulebook?.settings, contentsHash),
    });
    return;
  }
  const contentsHash = rulebookEditionContentsHash(value);
  const edition = await ctx.db.get('rulebook_editions', row.edition_id);
  await ctx.db.patch('rulebook_edition_contents', row._id, { contents: value });
  if (edition) {
    await ctx.db.patch('rulebook_editions', edition._id, {
      contents_hash: contentsHash,
      authored_hash: authoredHash(edition.settings, contentsHash),
    });
  }
}

/** Saves a page of the Nexus cards linked to a retired Faction through the Nexus writer, which leads them on; the next cursor, or null when done. */
async function relinkNexusCards(ctx: MutationCtx, retiredFamilyId: Id<'faction_families'>, cursor: string | null) {
  const page = await ctx.db
    .query('assets')
    .withIndex('by_type_deleted', (q) => q.eq('type', 'card-nexus'))
    .paginate({ cursor, numItems: 50 });
  for (const card of page.page) {
    if ((card.data as { factionLink?: { id?: string } } | null)?.factionLink?.id === retiredFamilyId) {
      const data = await withNexusFaction(ctx, 'card-nexus', card.data);
      await ctx.db.patch('assets', card._id, { data });
      if (!card.is_deleted) {
        await enqueueAssetPublication(ctx, { _id: card._id, type: card.type, slug: card.slug, data });
      }
    }
  }
  return page.isDone ? null : page.continueCursor;
}
