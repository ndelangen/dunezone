import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';

import { INHERITABLE_FIELDS, resolveVariantData } from '../src/shared/factions/variantFields';
import { rulebookSettingsSchema } from '../src/shared/rulebooks/settings';
import { slugify } from '../src/shared/slugify';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { adminQuery, internalMutation, mutation } from './functions';
import { variantsOf } from './lib/factionFamilies';
import { parseStoredFactionForRead } from './lib/factionInput';
import { inBranchOf, moveChildrenLater, moveToFamily, storeVariantData } from './lib/factionVariants';
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
};

type AttachArgs = { faction_id: Id<'factions'>; family_id: Id<'faction_families'>; parent_id: Id<'factions'> | null };
type Reader = Pick<QueryCtx, 'db'>;

/** The variant and every variant below it, live or deleted, parents before children. */
async function branchOf(ctx: Reader, root: Doc<'factions'>) {
  const branch = [root];
  for (let index = 0; index < branch.length; index += 1) {
    const children = await ctx.db
      .query('factions')
      .withIndex('by_parent', (q) => q.eq('parent_id', branch[index]!._id))
      .collect();
    branch.push(...children.filter((child) => !branch.some((row) => row._id === child._id)));
  }
  return branch;
}

/**
 * Everything an attach would change, refused where it may not happen: what the merge preview shows and the merge does.
 * `maps` holds the id pairs of each row whose leader or troop ids change: the variant, and each variant below it that follows it in those fields.
 */
async function planAttach(ctx: Reader, args: AttachArgs) {
  const variant = await ctx.db.get(args.faction_id);
  if (!variant) {
    throw new ConvexError('That variant no longer exists.');
  }
  const target = await ctx.db.get(args.family_id);
  if (!target || target.is_deleted) {
    throw new ConvexError('That faction no longer exists.');
  }
  const parent = args.parent_id ? await ctx.db.get(args.parent_id) : null;
  if (args.parent_id && (!parent || parent.is_deleted || parent.family_id !== target._id)) {
    throw new ConvexError('The parent must be a live variant of the faction it joins.');
  }
  if (parent && (await inBranchOf(ctx, parent._id, variant._id))) {
    throw new ConvexError('A variant cannot sit under itself or one of its own variants.');
  }
  const data = parseStoredFactionForRead(variant.data);
  const parentData = parent ? parseStoredFactionForRead(parent.data) : null;
  const fields = parentData ? matchingFields(parentData, data) : [];
  const branch = await branchOf(ctx, variant);
  const pairs = new Map<Id<'factions'>, IdPairsByField>();
  const maps = new Map<Id<'factions'>, ComponentIdMap>();
  for (const row of branch) {
    const byField =
      row._id === variant._id
        ? parentData
          ? idPairsByField(parentData, data, fields)
          : {}
        : followedPairs(pairs.get(row.parent_id!) ?? {}, row.inherited ?? []);
    pairs.set(row._id, byField);
    const map = idMapFor(byField);
    if (!isEmptyIdMap(map)) {
      maps.set(row._id, map);
    }
  }
  const source = await ctx.db.get(variant.family_id);
  const moves = variant.family_id !== target._id;
  const leftBehind =
    moves && (await firstVariant(ctx, variant.family_id, (row) => !branch.some((moving) => moving._id === row._id)));
  return {
    variant,
    target,
    parent,
    source,
    fields,
    branch,
    maps,
    /** Whether the variant's Faction is left with no variant, so it retires into the one it joins. */
    retiresSource: moves && !leftBehind,
  };
}

/** A sibling in the Faction the variant joins that already answers to its name, if any. */
async function nameClash(ctx: Reader, family: Doc<'faction_families'>, variant: Doc<'factions'>) {
  return await firstVariant(
    ctx,
    family._id,
    (row) => row._id !== variant._id && row.variant_slug === variant.variant_slug
  );
}

/** The Faction's first variant, live or deleted, that `matches`, or null. */
async function firstVariant(ctx: Reader, familyId: Id<'faction_families'>, matches: (row: Doc<'factions'>) => boolean) {
  for await (const row of variantsOf(ctx, familyId)) {
    if (matches(row)) {
      return row;
    }
  }
  return null;
}

/**
 * What a merge would do, for the admin to check before running it (#2914).
 * The references it rewrites are listed by `referencePreview`, a page at a time.
 */
export const preview = adminQuery({
  args: attachArgs,
  returns: v.object({
    variantName: v.string(),
    targetName: v.string(),
    sourceName: v.union(v.string(), v.null()),
    moves: v.boolean(),
    retiresSource: v.boolean(),
    nameClash: v.boolean(),
    followed: v.array(v.string()),
    custom: v.array(v.string()),
    branch: v.array(
      v.object({
        _id: v.id('factions'),
        name: v.string(),
        isDeleted: v.boolean(),
        changesIds: v.boolean(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const plan = await planAttach(ctx, args);
    return {
      variantName: plan.variant.variant_name,
      targetName: plan.target.data?.name ?? plan.target.slug,
      sourceName: plan.source?.data?.name ?? null,
      moves: plan.variant.family_id !== plan.target._id,
      retiresSource: plan.retiresSource,
      nameClash: !!(await nameClash(ctx, plan.target, plan.variant)),
      followed: plan.fields,
      custom: plan.parent ? INHERITABLE_FIELDS.filter((field) => !plan.fields.includes(field)) : [],
      branch: plan.branch.map((row) => ({
        _id: row._id,
        name: row.variant_name,
        isDeleted: row.is_deleted,
        changesIds: plan.maps.has(row._id),
      })),
    };
  },
});

/** The references in one Rulebook, draft and Editions, that these maps rewrite. */
async function rulebookReferences(ctx: Reader, rulebook: Doc<'rulebooks'>, maps: ReadonlyMap<string, ComponentIdMap>) {
  const draft = await ctx.db
    .query('rulebook_drafts')
    .withIndex('by_rulebook', (q) => q.eq('rulebook_id', rulebook._id))
    .first();
  const editions = [];
  for (const edition of await ctx.db
    .query('rulebook_editions')
    .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', rulebook._id))
    .collect()) {
    const contents = await ctx.db
      .query('rulebook_edition_contents')
      .withIndex('by_edition_id', (q) => q.eq('edition_id', edition._id))
      .first();
    if (contents) {
      editions.push({ edition, contents, ...rewriteComponentReferences(contents.contents, maps) });
    }
  }
  return { draft: draft && { row: draft, ...rewriteComponentReferences(draft.contents, maps) }, editions };
}

/** The Rulebooks a merge rewrites references in, a page of Rulebooks at a time; pages may come back empty. */
export const referencePreview = adminQuery({
  args: { ...attachArgs, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      rulebookId: v.id('rulebooks'),
      name: v.string(),
      draft: v.number(),
      editions: v.array(v.object({ number: v.number(), references: v.number() })),
    })
  ),
  handler: async (ctx, { paginationOpts, ...args }) => {
    const { maps } = await planAttach(ctx, args);
    const page = await ctx.db
      .query('rulebooks')
      .paginate({ ...paginationOpts, numItems: Math.min(paginationOpts.numItems, 5) });
    const rows = [];
    for (const rulebook of maps.size ? page.page : []) {
      const found = await rulebookReferences(ctx, rulebook, maps);
      const editions = found.editions
        .filter((edition) => edition.rewritten)
        .map((edition) => ({ number: edition.edition.edition_number, references: edition.rewritten }));
      if (found.draft?.rewritten || editions.length) {
        rows.push({ rulebookId: rulebook._id, name: rulebook.name, draft: found.draft?.rewritten ?? 0, editions });
      }
    }
    return { ...page, page: rows };
  },
});

/**
 * Merges the variant, with its branch, into the Faction under the parent, or re-parents it within its own Faction (#2932).
 * Only admins may run it;
 * it is a production write the preview shows first.
 * The variant takes the parent's ids in every field it now follows;
 * its branch follows one variant per transaction, and the references to the old ids are rewritten after it.
 * A Faction left with no variant retires into the one it joined: its address leads there.
 */
export const attach = mutation({
  args: { ...attachArgs, name: v.string() },
  returns: v.object({ slug: v.string() }),
  handler: async (ctx, args) => {
    await requireAdminUserId(ctx);
    const variantSlug = slugify(args.name);
    if (!variantSlug) {
      throw new ConvexError('Give the variant a name.');
    }
    await ctx.db.patch(args.faction_id, { variant_name: args.name.trim(), variant_slug: variantSlug });
    const plan = await planAttach(ctx, args);
    if (await nameClash(ctx, plan.target, plan.variant)) {
      throw new ConvexError('The faction already has a variant with this name.');
    }
    const link = { parent_id: plan.parent?._id, inherited: plan.parent ? plan.fields : undefined };
    const moves = plan.variant.family_id !== plan.target._id;
    if (moves) {
      await moveToFamily(ctx, plan.variant, plan.target, link);
    } else {
      await ctx.db.patch(plan.variant._id, link);
    }
    const placed = (await ctx.db.get(plan.variant._id))!;
    const data = parseStoredFactionForRead(placed.data);
    const stored = await storeVariantData(
      ctx,
      placed,
      plan.parent ? resolveVariantData(parseStoredFactionForRead(plan.parent.data), data, plan.fields) : data
    );
    if (moves) {
      await moveChildrenLater(ctx, placed._id);
    }
    if (plan.retiresSource && plan.source) {
      await ctx.db.patch(plan.source._id, { is_deleted: true, merged_into: plan.target._id });
    }
    if (plan.maps.size || plan.retiresSource) {
      await ctx.scheduler.runAfter(0, internal.factionMerge.rewriteReferences, {
        maps: [...plan.maps].map(([factionId, map]) => ({ factionId, ...map })),
        retiredFamilyId: plan.retiresSource ? plan.source?._id : undefined,
        targetFamilyId: plan.target._id,
        phase: 'rulebooks',
        cursor: null,
      });
    }
    return { slug: stored.slug };
  },
});

/** Rewrites one Rulebook's draft and Editions, recomputing their hashes; the draft's revision moves on, so an editor holding it reloads. */
async function rewriteRulebook(
  ctx: MutationCtx,
  rulebook: Doc<'rulebooks'>,
  maps: ReadonlyMap<string, ComponentIdMap>
) {
  const found = await rulebookReferences(ctx, rulebook, maps);
  if (found.draft?.rewritten) {
    const contentsHash = rulebookDraftContentsHash(found.draft.value);
    const settings = rulebookSettingsSchema.safeParse(rulebook.settings);
    await ctx.db.patch(found.draft.row._id, {
      contents: found.draft.value,
      revision: found.draft.row.revision + 1,
      contents_hash: contentsHash,
      authored_hash: settings.success ? rulebookAuthoredHash(settings.data, contentsHash) : undefined,
    });
  }
  for (const edition of found.editions) {
    if (edition.rewritten) {
      const contentsHash = rulebookEditionContentsHash(edition.value);
      const settings = rulebookSettingsSchema.safeParse(edition.edition.settings);
      await ctx.db.patch(edition.contents._id, { contents: edition.value });
      await ctx.db.patch(edition.edition._id, {
        contents_hash: contentsHash,
        authored_hash: settings.success ? rulebookAuthoredHash(settings.data, contentsHash) : undefined,
      });
    }
  }
}

/**
 * Rewrites the references a merge left pointing at old leader and troop ids, one Rulebook per transaction (#2914).
 * Then, when the merge retired a Faction, re-points the Nexus cards that named it at the Faction it joined.
 */
export const rewriteReferences = internalMutation({
  args: {
    maps: v.array(
      v.object({
        factionId: v.id('factions'),
        members: v.record(v.string(), v.string()),
        troops: v.record(v.string(), v.string()),
      })
    ),
    retiredFamilyId: v.optional(v.id('faction_families')),
    targetFamilyId: v.id('faction_families'),
    phase: v.union(v.literal('rulebooks'), v.literal('nexus')),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const next = (fields: Partial<typeof args>) =>
      ctx.scheduler.runAfter(0, internal.factionMerge.rewriteReferences, { ...args, ...fields });
    if (args.phase === 'rulebooks') {
      const maps = new Map<string, ComponentIdMap>(args.maps.map(({ factionId, ...map }) => [factionId, map]));
      const page = maps.size
        ? await ctx.db.query('rulebooks').paginate({ cursor: args.cursor, numItems: 1 })
        : { page: [], isDone: true, continueCursor: '' };
      for (const rulebook of page.page) {
        await rewriteRulebook(ctx, rulebook, maps);
      }
      await next(page.isDone ? { phase: 'nexus', cursor: null } : { cursor: page.continueCursor });
      return null;
    }
    if (!args.retiredFamilyId) {
      return null;
    }
    const page = await ctx.db
      .query('assets')
      .withIndex('by_type_deleted', (q) => q.eq('type', 'card-nexus'))
      .paginate({ cursor: args.cursor, numItems: 50 });
    const target = (await ctx.db.get(args.targetFamilyId))!;
    for (const card of page.page) {
      const link = (card.data as { factionLink?: { id?: string } } | null)?.factionLink;
      if (link?.id === args.retiredFamilyId) {
        await ctx.db.patch(card._id, { data: { ...card.data, factionLink: { id: target._id, slug: target.slug } } });
      }
    }
    if (!page.isDone) {
      await next({ cursor: page.continueCursor });
    }
    return null;
  },
});
