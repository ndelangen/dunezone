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

const attachArgs = {
  faction_id: v.id('factions'),
  family_id: v.id('faction_families'),
  parent_id: v.union(v.id('factions'), v.null()),
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

/**
 * Everything an attach would change, refused where it may not happen: what the merge preview shows and the merge does.
 * `maps` holds the id pairs of each row whose leader or troop ids change: the variant, and each variant below it that follows it in those fields.
 */
async function planAttach(ctx: Reader, args: AttachArgs) {
  const variant = await ctx.db.get('factions', args.faction_id);
  if (!variant) {
    throw new ConvexError('That variant no longer exists.');
  }
  const target = await ctx.db.get('faction_families', args.family_id);
  if (!target || target.is_deleted) {
    throw new ConvexError('That faction no longer exists.');
  }
  const parent = args.parent_id ? await ctx.db.get('factions', args.parent_id) : null;
  if (args.parent_id && (!parent || parent.is_deleted || parent.family_id !== target._id)) {
    throw new ConvexError('The parent must be a live variant of the faction it joins.');
  }
  if (parent && (await inBranchOf(ctx, parent._id, variant._id))) {
    throw new ConvexError('A variant cannot sit under itself or one of its own variants.');
  }
  const name = args.name?.trim() ?? variant.variant_name;
  if (!slugify(name)) {
    throw new ConvexError('Give the variant a name.');
  }
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
  let liveLeftBehind = false;
  let deletedLeftBehind = 0;
  if (moves) {
    for await (const row of variantsOf(ctx, variant.family_id)) {
      if (!inBranch.has(row._id)) {
        liveLeftBehind ||= !row.is_deleted;
        deletedLeftBehind += row.is_deleted ? 1 : 0;
      }
    }
  }
  return {
    variant,
    name,
    target,
    parent,
    source: await ctx.db.get('faction_families', variant.family_id),
    fields,
    moves,
    branch: branch.map((row, index) => {
      const rowName = index === 0 ? name : row.variant_name;
      return { row, name: rowName, nameClash: takenSlugs.has(slugify(rowName)) };
    }),
    maps: branchMaps(branch, parentData ? idPairsByField(parentData, data, fields) : {}),
    /** Whether the variant's Faction is left with no live variant, so it retires into the one it joins. */
    retiresSource: moves && !liveLeftBehind,
    /** The deleted variants that stay in a Faction that retires, unless they are merged too. */
    deletedLeftBehind: moves && !liveLeftBehind ? deletedLeftBehind : 0,
  };
}

/**
 * What a merge would do, for the admin to check before running it (#2914).
 * The references it rewrites are listed by `referencePreview`, a page at a time.
 */
export const preview = adminQuery({
  args: attachArgs,
  returns: v.object({
    targetName: v.string(),
    sourceName: v.union(v.string(), v.null()),
    moves: v.boolean(),
    retiresSource: v.boolean(),
    deletedLeftBehind: v.number(),
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
      targetName: plan.target.data?.name ?? plan.target.slug,
      sourceName: plan.source?.data?.name ?? null,
      moves: plan.moves,
      retiresSource: plan.retiresSource,
      deletedLeftBehind: plan.deletedLeftBehind,
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
    const next = (fields: Pick<typeof args, 'phase' | 'cursor'>) =>
      ctx.scheduler.runAfter(0, internal.factionMerge.rewriteReferences, { ...args, ...fields });
    if (args.phase !== 'nexus') {
      const maps = new Map(args.maps.map(({ factionId, ...map }) => [factionId as string, map]));
      const page = await documentPage(ctx, args.phase, maps, { cursor: args.cursor, numItems: 1 });
      for (const { row, value, rewritten } of page.page) {
        if (!rewritten) {
          continue;
        }
        if ('rulebook_id' in row) {
          const contentsHash = rulebookDraftContentsHash(value);
          const rulebook = await ctx.db.get('rulebooks', row.rulebook_id);
          await ctx.db.patch('rulebook_drafts', row._id, {
            contents: value,
            revision: row.revision + 1,
            contents_hash: contentsHash,
            authored_hash: authoredHash(rulebook?.settings, contentsHash),
          });
        } else {
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
      }
      if (!page.isDone) {
        await next({ phase: args.phase, cursor: page.continueCursor });
      } else if (args.phase === 'drafts') {
        await next({ phase: 'editions', cursor: null });
      } else if (args.retiredFamilyId) {
        await next({ phase: 'nexus', cursor: null });
      }
      return null;
    }
    if (!args.retiredFamilyId) {
      return null;
    }
    const page = await ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', 'card-nexus'))
      .paginate({ cursor: args.cursor, numItems: 50 });
    for (const card of page.page) {
      if ((card.data as { factionLink?: { id?: string } } | null)?.factionLink?.id === args.retiredFamilyId) {
        await ctx.db.patch('assets', card._id, { data: await withNexusFaction(ctx, 'card-nexus', card.data) });
      }
    }
    if (!page.isDone) {
      await next({ phase: 'nexus', cursor: page.continueCursor });
    }
    return null;
  },
});
