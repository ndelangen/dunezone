import { zodToConvex } from 'convex-helpers/server/zod4';
import { ConvexError, v } from 'convex/values';

import {
  createRulebookLocalId,
  isRulebookLayoutSupported,
  RULEBOOK_CATALOGUE_VERSION,
  rulebookContentsV1Schema,
  rulebookEditionContentsV1Schema,
} from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { createRulebookEditorialStarterContents } from '../src/shared/rulebooks/fixtures';
import { rulebookNameKey, rulebookNameSchema, rulebookRevisionSchema } from '../src/shared/rulebooks/metadata';
import { rulebookResolvedFactionsByIdSchema } from '../src/shared/rulebooks/references';
import { DEFAULT_RULEBOOK_SETTINGS, rulebookSettingsSchema } from '../src/shared/rulebooks/settings';
import type { RulebookDesign, RulebookSettings } from '../src/shared/rulebooks/settings';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { mutation } from './functions';
import { loadRulesetAccessForLoadedSubject, requireRulesetMaintenance } from './lib/collaborativeAccess';
import { rulesetViewerAccessValidator } from './lib/collaborativeAccessValidators';
import { requireAuthUserId } from './lib/policy';
import {
  ensureRulebookEditionArtifacts,
  rulebookEditionArtifactReadinessValidator,
  rulebookEditionSummary,
  rulebookEditionSummaryValidator,
} from './lib/rulebookEditionArtifacts';
import {
  contentsForRulebookEdition,
  insertRulebookEditionContents,
  rulebookContentsMatch,
} from './lib/rulebookEditionContents';
import {
  listRulesetRulebooks,
  rulebookMetadata as metadataFrom,
  rulebookMetadataValidator,
  rulebookListEntryValidator,
} from './lib/rulebookList';
import { enqueueRulebookFirstPagePublication } from './lib/rulebookPublication';
import { resolveRulebookReferences } from './lib/rulebookReferences';
import { rulebookDesignValidator, rulebookSettingsValidator } from './lib/rulebookSettings';
import { loadPublicRulesetBySlug } from './lib/rulesetDetailPage';
import { nowIso, slugify } from './lib/utils';
import type { MutationCtx, QueryCtx } from './types';

const savedDraftValidator = v.object({
  _id: v.id('rulebook_drafts'),
  _creationTime: v.number(),
  rulebook_id: v.id('rulebooks'),
  revision: v.number(),
  contents: v.any(),
  updated_by: v.id('users'),
  updated_at: v.string(),
});

const editionValidator = v.object({
  _id: v.id('rulebook_editions'),
  settings: rulebookSettingsValidator,
  _creationTime: v.number(),
  rulebook_id: v.id('rulebooks'),
  edition_number: v.number(),
  contents: v.any(),
  created_by: v.id('users'),
  created_at: v.string(),
});

const resolvedAssetsValidator = v.record(
  v.string(),
  v.object({
    assetId: v.string(),
    name: v.string(),
    type: v.string(),
    imageUrl: v.union(v.string(), v.null()),
  })
);

const resolvedFactionsValidator = zodToConvex(rulebookResolvedFactionsByIdSchema);

const editorBundleValidator = v.object({
  rulebook: rulebookMetadataValidator,
  draft: savedDraftValidator,
  edition: editionValidator,
});

const saveResultValidator = v.union(
  v.object({ kind: v.literal('saved'), draft: savedDraftValidator }),
  v.object({ kind: v.literal('stale'), draft: savedDraftValidator })
);

const publishResultValidator = v.union(
  v.object({ kind: v.literal('stale'), draft: savedDraftValidator }),
  v.object({
    kind: v.literal('unchanged'),
    currentEdition: rulebookEditionSummaryValidator,
  }),
  v.object({
    kind: v.literal('published'),
    currentEdition: rulebookEditionSummaryValidator,
  })
);

type AnyCtx = QueryCtx | MutationCtx;

function parseName(name: string) {
  const parsed = rulebookNameSchema.safeParse(name);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(' ') || 'Invalid Rulebook name');
  }
  return parsed.data;
}

function parseContents(contents: unknown) {
  const parsed = rulebookContentsV1Schema.safeParse(contents);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(' ') || 'Invalid Rulebook Contents');
  }
  return parsed.data;
}

function parseEditionContents(contents: unknown) {
  const parsed = rulebookEditionContentsV1Schema.safeParse(contents);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(' ') || 'Invalid Rulebook Edition Contents');
  }
  return parsed.data;
}

function contentsMatch(left: RulebookContentsV1, right: RulebookContentsV1) {
  return rulebookContentsMatch(left, right);
}

async function rulebookById(ctx: AnyCtx, rulebookId: Id<'rulebooks'>) {
  const rulebook = await ctx.db.get('rulebooks', rulebookId);
  if (!rulebook || rulebook.is_deleted) {
    throw new Error('Rulebook not found');
  }
  return rulebook;
}

async function draftFor(ctx: AnyCtx, rulebookId: Id<'rulebooks'>) {
  const draft = await ctx.db
    .query('rulebook_drafts')
    .withIndex('by_rulebook', (q) => q.eq('rulebook_id', rulebookId))
    .unique();
  if (!draft) {
    throw new Error('Rulebook draft not found');
  }
  return { ...draft, contents: parseContents(draft.contents) };
}

async function editionFor(ctx: AnyCtx, rulebookId: Id<'rulebooks'>, editionNumber: number) {
  const edition = await ctx.db
    .query('rulebook_editions')
    .withIndex('by_rulebook_and_edition_number', (q) =>
      q.eq('rulebook_id', rulebookId).eq('edition_number', editionNumber)
    )
    .unique();
  if (!edition) {
    throw new Error('Rulebook edition not found');
  }
  return {
    ...edition,
    settings: edition.settings ?? DEFAULT_RULEBOOK_SETTINGS,
    contents: parseEditionContents(await contentsForRulebookEdition(ctx, edition)),
  };
}

async function assertAvailableName(ctx: AnyCtx, rulesetId: Id<'rulesets'>, name: string, excludeId?: Id<'rulebooks'>) {
  const key = rulebookNameKey(name);
  const matches = await ctx.db
    .query('rulebooks')
    .withIndex('by_ruleset_and_is_deleted_and_name_key', (q) =>
      q.eq('ruleset_id', rulesetId).eq('is_deleted', false).eq('name_key', key)
    )
    .collect();
  if (matches.some((row) => row._id !== excludeId)) {
    throw new Error('Rulebook name already exists');
  }
  return key;
}

async function resolveUniqueSlug(ctx: AnyCtx, rulesetId: Id<'rulesets'>, name: string, excludeId?: Id<'rulebooks'>) {
  const baseSlug = slugify(name) || 'rulebook';
  /* The creation route occupies /rulebooks/create, so no reader may receive that slug. */
  let suffix = baseSlug === 'create' ? 2 : 1;
  let slug = suffix === 1 ? baseSlug : `${baseSlug}-${suffix}`;
  while (true) {
    const existing = await ctx.db
      .query('rulebooks')
      .withIndex('by_ruleset_and_slug', (q) => q.eq('ruleset_id', rulesetId).eq('slug', slug))
      .unique();
    if (!existing || existing._id === excludeId) {
      return slug;
    }
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }
}

type RulebookPage = RulebookContentsV1['pagesById'][string];
type RulebookBlock = RulebookPage['blocksById'][string];
type CollectionBlock = Extract<
  RulebookBlock,
  { kind: 'repeated-text' | 'list' | 'illustrated-inventory' | 'card-group' }
>;

function freshIdentityMap(sourceIds: readonly string[]) {
  const identities = new Map<string, string>();
  const reserved = new Set(sourceIds);
  for (const sourceId of sourceIds) {
    const identity = createRulebookLocalId(reserved);
    reserved.add(identity);
    identities.set(sourceId, identity);
  }
  return identities;
}

function cloneCollectionBlock(source: CollectionBlock, id: string): CollectionBlock {
  const itemIds = freshIdentityMap(source.itemOrder);
  return {
    ...structuredClone(source),
    id,
    ...(source.kind === 'card-group' && source.featuredItemId
      ? { featuredItemId: itemIds.get(source.featuredItemId)! }
      : {}),
    itemOrder: source.itemOrder.map((itemId) => itemIds.get(itemId)!),
    itemsById: Object.fromEntries(
      Object.entries(source.itemsById).map(([sourceItemId, item]) => {
        const itemId = itemIds.get(sourceItemId)!;
        return [itemId, { ...structuredClone(item), id: itemId }];
      })
    ),
  };
}

function cloneBlock(source: RulebookBlock, id: string): RulebookBlock {
  return source.kind === 'repeated-text' ||
    source.kind === 'list' ||
    source.kind === 'illustrated-inventory' ||
    source.kind === 'card-group'
    ? cloneCollectionBlock(source, id)
    : { ...structuredClone(source), id };
}

function clonePage(source: RulebookPage, id: string): RulebookPage {
  const blockIds = freshIdentityMap(Object.keys(source.blocksById));
  return {
    ...structuredClone(source),
    id,
    blockOrderByRegion: Object.fromEntries(
      Object.entries(source.blockOrderByRegion).map(([region, order]) => [
        region,
        order.map((blockId) => blockIds.get(blockId)!),
      ])
    ) as RulebookPage['blockOrderByRegion'],
    blocksById: Object.fromEntries(
      Object.entries(source.blocksById).map(([sourceBlockId, block]) => {
        const blockId = blockIds.get(sourceBlockId)!;
        return [blockId, cloneBlock(block, blockId)];
      })
    ),
  } as RulebookPage;
}

function cloneContentsWithFreshIds(contents: RulebookContentsV1): RulebookContentsV1 {
  const pageIds = freshIdentityMap(contents.pageOrder);
  return parseContents({
    schemaVersion: 1,
    pageOrder: contents.pageOrder.map((pageId) => pageIds.get(pageId)!),
    pagesById: Object.fromEntries(
      contents.pageOrder.map((sourcePageId) => {
        const pageId = pageIds.get(sourcePageId)!;
        return [pageId, clonePage(contents.pagesById[sourcePageId], pageId)];
      })
    ),
  });
}

async function requireRulebookOwner(ctx: MutationCtx, rulebookId: Id<'rulebooks'>) {
  const rulebook = await rulebookById(ctx, rulebookId);
  const ruleset = await ctx.db.get('rulesets', rulebook.ruleset_id);
  if (!ruleset || ruleset.is_deleted) {
    throw new Error('Ruleset not found');
  }
  const access = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
  if (access.viewerId !== ruleset.owner_id) {
    throw new Error('Not authorized');
  }
  return { rulebook, ruleset, viewerId: access.viewerId };
}

type RulebookCreationSource =
  | { kind: 'starter'; settings?: RulebookSettings }
  | { kind: 'clone'; rulebook_id: Id<'rulebooks'>; design?: RulebookDesign };

async function contentsForCreation(ctx: MutationCtx, rulesetId: Id<'rulesets'>, source: RulebookCreationSource) {
  if (source.kind === 'starter') {
    return {
      contents: createRulebookEditorialStarterContents(),
      settings: rulebookSettingsSchema.parse(source.settings ?? DEFAULT_RULEBOOK_SETTINGS),
    };
  }
  const sourceRulebook = await rulebookById(ctx, source.rulebook_id);
  if (sourceRulebook.ruleset_id !== rulesetId) {
    throw new Error('Rulebook clone source must belong to the same Ruleset');
  }
  const sourceSettings = sourceRulebook.settings ?? DEFAULT_RULEBOOK_SETTINGS;
  return {
    contents: cloneContentsWithFreshIds((await draftFor(ctx, sourceRulebook._id)).contents),
    settings: rulebookSettingsSchema.parse({
      size: sourceSettings.size,
      design: source.design ?? sourceSettings.design,
    }),
  };
}

async function nextSortOrder(ctx: MutationCtx, rulesetId: Id<'rulesets'>) {
  const last = await ctx.db
    .query('rulebooks')
    .withIndex('by_ruleset_and_is_deleted_and_sort_order', (q) => q.eq('ruleset_id', rulesetId).eq('is_deleted', false))
    .order('desc')
    .first();
  return (last?.sort_order ?? -1) + 1;
}

function createdDocument<T>(document: T | null): T {
  if (!document) {
    throw new Error('Failed to create Rulebook');
  }
  return document;
}

function assertCompleteRulebookOrder(currentIds: Id<'rulebooks'>[], proposedIds: Id<'rulebooks'>[]) {
  const current = new Set(currentIds);
  const proposed = new Set(proposedIds);
  if (proposed.size !== proposedIds.length) {
    throw new Error('Rulebook order must contain every live Rulebook exactly once');
  }
  if (proposed.size !== current.size) {
    throw new Error('Rulebook order must contain every live Rulebook exactly once');
  }
  if (currentIds.some((rulebookId) => !proposed.has(rulebookId))) {
    throw new Error('Rulebook order must contain every live Rulebook exactly once');
  }
}

async function insertRulebookBundle(
  ctx: MutationCtx,
  input: {
    rulesetId: Id<'rulesets'>;
    viewerId: Id<'users'>;
    name: string;
    nameKey: string;
    slug: string;
    sortOrder: number;
    contents: RulebookContentsV1;
    settings: RulebookSettings;
  }
) {
  const now = nowIso();
  const rulebookId = await ctx.db.insert('rulebooks', {
    ruleset_id: input.rulesetId,
    settings: input.settings,
    name: input.name,
    name_key: input.nameKey,
    slug: input.slug,
    sort_order: input.sortOrder,
    current_edition_number: 1,
    created_by: input.viewerId,
    created_at: now,
    updated_at: now,
    is_deleted: false,
    deleted_at: null,
  });
  const draftId = await ctx.db.insert('rulebook_drafts', {
    rulebook_id: rulebookId,
    revision: 1,
    contents: input.contents,
    updated_by: input.viewerId,
    updated_at: now,
  });
  const editionId = await ctx.db.insert('rulebook_editions', {
    rulebook_id: rulebookId,
    settings: input.settings,
    edition_number: 1,
    created_by: input.viewerId,
    created_at: now,
  });
  await insertRulebookEditionContents(ctx, editionId, input.contents);
  await ensureRulebookEditionArtifacts(ctx, {
    _id: editionId,
    rulebook_id: rulebookId,
    edition_number: 1,
    created_at: now,
  });
  await enqueueRulebookFirstPagePublication(ctx, {
    _id: editionId,
    rulebook_id: rulebookId,
    edition_number: 1,
    contents: input.contents,
    settings: input.settings,
  });
  const [rulebook, draft, edition] = await Promise.all([
    ctx.db.get('rulebooks', rulebookId),
    ctx.db.get('rulebook_drafts', draftId),
    ctx.db.get('rulebook_editions', editionId),
  ]);
  const createdEdition = createdDocument(edition);
  return {
    rulebook: metadataFrom(createdDocument(rulebook)),
    draft: createdDocument(draft),
    edition: { ...createdEdition, settings: input.settings, contents: input.contents },
  };
}

export const listByRulesetSlug = query({
  args: { ruleset_slug: v.string() },
  returns: v.array(rulebookListEntryValidator),
  handler: async (ctx, args) => {
    const ruleset = await ctx.db
      .query('rulesets')
      .withIndex('by_slug', (q) => q.eq('slug', args.ruleset_slug))
      .unique();
    if (!ruleset || ruleset.is_deleted) {
      return [];
    }
    return await listRulesetRulebooks(ctx, ruleset._id);
  },
});

/** Creation needs the owning Ruleset's access and live clone choices, never its saved Contents. */
export const creationPage = query({
  args: { ruleset_slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ruleset: v.object({
        _id: v.id('rulesets'),
        name: v.string(),
        slug: v.string(),
      }),
      viewerAccess: rulesetViewerAccessValidator,
      rulebooks: v.array(rulebookListEntryValidator),
    })
  ),
  handler: async (ctx, args) => {
    const ruleset = await loadPublicRulesetBySlug(ctx, args.ruleset_slug);
    if (!ruleset) {
      return null;
    }
    const { viewerAccess } = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
    return {
      ruleset: { _id: ruleset._id, name: ruleset.name, slug: ruleset.slug },
      viewerAccess,
      rulebooks: viewerAccess.capabilities.edit ? await listRulesetRulebooks(ctx, ruleset._id) : [],
    };
  },
});

async function rulebookAtSlugs(ctx: QueryCtx, args: { ruleset_slug: string; rulebook_slug: string }) {
  const ruleset = await ctx.db
    .query('rulesets')
    .withIndex('by_slug', (q) => q.eq('slug', args.ruleset_slug))
    .unique();
  if (!ruleset || ruleset.is_deleted) {
    return null;
  }
  const rulebook = await ctx.db
    .query('rulebooks')
    .withIndex('by_ruleset_and_slug', (q) => q.eq('ruleset_id', ruleset._id).eq('slug', args.rulebook_slug))
    .unique();
  return rulebook && !rulebook.is_deleted ? { ruleset, rulebook } : null;
}

export const editorBySlugs = query({
  args: { ruleset_slug: v.string(), rulebook_slug: v.string() },
  returns: v.union(editorBundleValidator, v.null()),
  handler: async (ctx, args) => {
    const found = await rulebookAtSlugs(ctx, args);
    if (!found) {
      return null;
    }
    const { ruleset, rulebook } = found;
    const access = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
    if (!access.viewerAccess.capabilities.edit) {
      throw new Error('Not authorized');
    }
    return {
      rulebook: metadataFrom(rulebook),
      draft: await draftFor(ctx, rulebook._id),
      edition: await editionFor(ctx, rulebook._id, rulebook.current_edition_number),
    };
  },
});

const readerEditionValidator = v.object({
  settings: rulebookSettingsValidator,
  edition_number: v.number(),
  contents: v.any(),
  created_at: v.string(),
  html: rulebookEditionArtifactReadinessValidator,
  pdf: rulebookEditionArtifactReadinessValidator,
});

const readerEditionOptionValidator = v.object({
  edition_number: v.number(),
  created_at: v.string(),
});

/** Every immutable Edition of a live Rulebook with its artifact readiness, newest first; a soft-deleted Rulebook has no history to show. */
export const editionHistory = query({
  args: { ruleset_slug: v.string(), rulebook_slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      ruleset: v.object({ name: v.string(), slug: v.string() }),
      rulebook: rulebookMetadataValidator,
      editions: v.array(rulebookEditionSummaryValidator),
    })
  ),
  handler: async (ctx, args) => {
    const found = await rulebookAtSlugs(ctx, args);
    if (!found) {
      return null;
    }
    const { ruleset, rulebook } = found;
    const editions = await ctx.db
      .query('rulebook_editions')
      .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', rulebook._id))
      .order('desc')
      .collect();
    return {
      ruleset: { name: ruleset.name, slug: ruleset.slug },
      rulebook: metadataFrom(rulebook),
      editions: await Promise.all(editions.map((edition) => rulebookEditionSummary(ctx, edition))),
    };
  },
});

/** Public reading loads one immutable Edition and its complete metadata history, never the author's saved draft. */
export const readerPage = query({
  args: {
    ruleset_slug: v.string(),
    rulebook_slug: v.string(),
    edition_number: v.optional(v.number()),
  },
  returns: v.union(
    v.null(),
    v.object({
      rulebook: rulebookMetadataValidator,
      edition: readerEditionValidator,
      editions: v.array(readerEditionOptionValidator),
      assetsById: resolvedAssetsValidator,
      factionsById: resolvedFactionsValidator,
    })
  ),
  handler: async (ctx, args) => {
    const found = await rulebookAtSlugs(ctx, args);
    if (!found) {
      return null;
    }
    const { rulebook } = found;
    const selectedNumber = args.edition_number ?? rulebook.current_edition_number;
    const selected = await ctx.db
      .query('rulebook_editions')
      .withIndex('by_rulebook_and_edition_number', (q) =>
        q.eq('rulebook_id', rulebook._id).eq('edition_number', selectedNumber)
      )
      .unique();
    if (!selected) {
      if (args.edition_number === undefined) {
        /* A Rulebook whose current Edition row is gone is a broken invariant, not something a reader asked for. */
        throw new Error('Rulebook edition not found');
      }
      /* A ConvexError, so the sentence survives to the reader's banner; a plain Error is redacted to "Server Error" outside dev. */
      throw new ConvexError(`Rulebook Edition ${selectedNumber} does not exist`);
    }
    const editions = await ctx.db
      .query('rulebook_editions')
      .withIndex('by_rulebook_and_edition_number', (q) => q.eq('rulebook_id', rulebook._id))
      .order('desc')
      .collect();
    const contents = parseEditionContents(await contentsForRulebookEdition(ctx, selected));
    const summary = await rulebookEditionSummary(ctx, selected);
    return {
      rulebook: metadataFrom(rulebook),
      edition: {
        edition_number: selected.edition_number,
        settings: selected.settings ?? DEFAULT_RULEBOOK_SETTINGS,
        contents,
        created_at: selected.created_at,
        html: summary.html,
        pdf: summary.pdf,
      },
      editions: editions.map(({ edition_number, created_at }) => ({
        edition_number,
        created_at,
      })),
      ...(await resolveRulebookReferences(ctx, contents)),
    };
  },
});

/** The editor's one subscription checks access before loading private draft Contents. */
export const editorPage = query({
  args: {
    ruleset_slug: v.string(),
    rulebook_slug: v.string(),
    reference_asset_ids: v.optional(v.array(v.string())),
    reference_faction_ids: v.optional(v.array(v.string())),
  },
  returns: v.union(
    v.null(),
    v.object({
      kind: v.union(v.literal('sign-in-required'), v.literal('denied')),
      rulebook: rulebookMetadataValidator,
    }),
    v.object({
      kind: v.literal('editable'),
      canRename: v.boolean(),
      rulebook: rulebookMetadataValidator,
      draft: savedDraftValidator,
      currentEdition: rulebookEditionSummaryValidator,
      hasUnpublishedChanges: v.boolean(),
      assetsById: resolvedAssetsValidator,
      factionsById: resolvedFactionsValidator,
    })
  ),
  handler: async (ctx, args) => {
    const found = await rulebookAtSlugs(ctx, args);
    if (!found) {
      return null;
    }
    const { ruleset, rulebook } = found;
    const { viewerAccess } = await loadRulesetAccessForLoadedSubject(ctx, ruleset);
    const metadata = metadataFrom(rulebook);
    if (!viewerAccess.capabilities.edit) {
      return {
        kind: viewerAccess.viewer.kind === 'anonymous' ? ('sign-in-required' as const) : ('denied' as const),
        rulebook: metadata,
      };
    }
    const draft = await draftFor(ctx, rulebook._id);
    const edition = await editionFor(ctx, rulebook._id, rulebook.current_edition_number);
    return {
      kind: 'editable' as const,
      canRename: viewerAccess.capabilities.rename,
      rulebook: metadata,
      draft,
      currentEdition: await rulebookEditionSummary(ctx, edition),
      hasUnpublishedChanges: !contentsMatch(draft.contents, edition.contents),
      ...(await resolveRulebookReferences(ctx, draft.contents, {
        assetIds: args.reference_asset_ids,
        factionIds: args.reference_faction_ids,
      })),
    };
  },
});

export const create = mutation({
  args: {
    catalogue_version: v.optional(v.number()),
    ruleset_id: v.id('rulesets'),
    name: v.string(),
    source: v.union(
      v.object({ kind: v.literal('starter'), settings: v.optional(rulebookSettingsValidator) }),
      v.object({
        kind: v.literal('clone'),
        rulebook_id: v.id('rulebooks'),
        design: v.optional(rulebookDesignValidator),
      })
    ),
  },
  returns: editorBundleValidator,
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);
    const viewerId = await requireAuthUserId(ctx);
    if (args.catalogue_version !== RULEBOOK_CATALOGUE_VERSION) {
      throw new ConvexError('Reload Dune Zone before creating or cloning a Rulebook.');
    }
    const name = parseName(args.name);
    const nameKey = await assertAvailableName(ctx, args.ruleset_id, name);
    const slug = await resolveUniqueSlug(ctx, args.ruleset_id, name);
    return await insertRulebookBundle(ctx, {
      rulesetId: args.ruleset_id,
      viewerId,
      name,
      nameKey,
      slug,
      sortOrder: await nextSortOrder(ctx, args.ruleset_id),
      ...(await contentsForCreation(ctx, args.ruleset_id, args.source)),
    });
  },
});

/** Surviving Page identities retain their layout and creation-only arrangement. */
function assertFixedPageLayouts(previous: RulebookContentsV1, next: RulebookContentsV1, settings: RulebookSettings) {
  for (const page of Object.values(next.pagesById)) {
    const before = previous.pagesById[page.id];
    if (!before) {
      if (!isRulebookLayoutSupported(page.layoutId, settings.size)) {
        throw new ConvexError('Choose a Page layout supported by this Rulebook size.');
      }
      continue;
    }
    if (before.layoutId !== page.layoutId) {
      throw new ConvexError('A Page layout is fixed when the Page is created.');
    }
    if (
      page.layoutId === 'wide-narrow' &&
      before.layoutId === 'wide-narrow' &&
      before.controlValues.widePosition !== page.controlValues.widePosition
    ) {
      throw new ConvexError('The wide column position is fixed when the Page is created.');
    }
    if (
      page.layoutId === 'band-columns' &&
      before.layoutId === 'band-columns' &&
      before.controlValues.bandPosition !== page.controlValues.bandPosition
    ) {
      throw new ConvexError('The band position is fixed when the Page is created.');
    }
  }
}

export const save = mutation({
  args: {
    rulebook_id: v.id('rulebooks'),
    expected_revision: v.number(),
    contents: v.any(),
  },
  returns: saveResultValidator,
  handler: async (ctx, args) => {
    const rulebook = await rulebookById(ctx, args.rulebook_id);
    await requireRulesetMaintenance(ctx, rulebook.ruleset_id);
    const viewerId = await requireAuthUserId(ctx);
    const expectedRevision = rulebookRevisionSchema.parse(args.expected_revision);
    const contents = parseContents(args.contents);
    const current = await draftFor(ctx, rulebook._id);
    if (current.revision !== expectedRevision) {
      return { kind: 'stale' as const, draft: current };
    }
    assertFixedPageLayouts(current.contents, contents, rulebook.settings ?? DEFAULT_RULEBOOK_SETTINGS);
    const now = nowIso();
    await ctx.db.patch('rulebook_drafts', current._id, {
      revision: current.revision + 1,
      contents,
      updated_by: viewerId,
      updated_at: now,
    });
    return {
      kind: 'saved' as const,
      draft: {
        ...current,
        revision: current.revision + 1,
        contents,
        updated_by: viewerId,
        updated_at: now,
      },
    };
  },
});

/** Publishes the clean saved draft as the next immutable current Edition without waiting for derived bytes. */
export const publish = mutation({
  args: {
    rulebook_id: v.id('rulebooks'),
    expected_revision: v.number(),
    confirmed: v.literal(true),
  },
  returns: publishResultValidator,
  handler: async (ctx, args) => {
    const rulebook = await rulebookById(ctx, args.rulebook_id);
    await requireRulesetMaintenance(ctx, rulebook.ruleset_id);
    const viewerId = await requireAuthUserId(ctx);
    const expectedRevision = rulebookRevisionSchema.parse(args.expected_revision);
    const draft = await draftFor(ctx, rulebook._id);
    if (draft.revision !== expectedRevision) {
      return { kind: 'stale' as const, draft };
    }
    const current = await editionFor(ctx, rulebook._id, rulebook.current_edition_number);
    if (contentsMatch(draft.contents, current.contents)) {
      return {
        kind: 'unchanged' as const,
        currentEdition: await rulebookEditionSummary(ctx, current),
      };
    }

    const editionNumber = rulebook.current_edition_number + 1;
    const existing = await ctx.db
      .query('rulebook_editions')
      .withIndex('by_rulebook_and_edition_number', (q) =>
        q.eq('rulebook_id', rulebook._id).eq('edition_number', editionNumber)
      )
      .unique();
    /* Convex serializes this mutation, so a second publisher reading the same `current_edition_number` retries
       against the committed row and returns `unchanged` above rather than arriving here. This stays as the
       integrity backstop for a row that reached the table some other way, and its test inserts exactly that. */
    if (existing) {
      throw new Error('Next Rulebook Edition already exists');
    }
    const now = nowIso();
    const settings = rulebook.settings ?? DEFAULT_RULEBOOK_SETTINGS;
    const editionId = await ctx.db.insert('rulebook_editions', {
      rulebook_id: rulebook._id,
      settings,
      edition_number: editionNumber,
      created_by: viewerId,
      created_at: now,
    });
    await insertRulebookEditionContents(ctx, editionId, draft.contents);
    const edition = {
      _id: editionId,
      rulebook_id: rulebook._id,
      settings,
      edition_number: editionNumber,
      contents: draft.contents,
      created_by: viewerId,
      created_at: now,
    };
    await ensureRulebookEditionArtifacts(ctx, edition);
    await enqueueRulebookFirstPagePublication(ctx, edition);
    await ctx.db.patch('rulebooks', rulebook._id, {
      current_edition_number: editionNumber,
      updated_at: now,
    });
    return {
      kind: 'published' as const,
      currentEdition: await rulebookEditionSummary(ctx, edition),
    };
  },
});

/** Retries the current Edition's independent first-page image without changing the Edition or draft. */
export const retryFirstPagePreview = mutation({
  args: { rulebook_id: v.id('rulebooks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rulebook = await rulebookById(ctx, args.rulebook_id);
    await requireRulesetMaintenance(ctx, rulebook.ruleset_id);
    const edition = await editionFor(ctx, rulebook._id, rulebook.current_edition_number);
    const result = await enqueueRulebookFirstPagePublication(ctx, edition);
    if (!result.enqueued) {
      throw new Error(
        result.skipped === 'no-first-page'
          ? 'Rulebook Edition has no first Page to preview'
          : 'Rulebook Edition Contents cannot produce a preview'
      );
    }
    return null;
  },
});

export const reorder = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    rulebook_ids: v.array(v.id('rulebooks')),
  },
  returns: v.array(v.id('rulebooks')),
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);
    const current = await ctx.db
      .query('rulebooks')
      .withIndex('by_ruleset_and_is_deleted_and_sort_order', (q) =>
        q.eq('ruleset_id', args.ruleset_id).eq('is_deleted', false)
      )
      .collect();
    assertCompleteRulebookOrder(
      current.map((rulebook) => rulebook._id),
      args.rulebook_ids
    );
    const now = nowIso();
    await Promise.all(
      args.rulebook_ids.map((rulebookId, sortOrder) =>
        ctx.db.patch('rulebooks', rulebookId, {
          sort_order: sortOrder,
          updated_at: now,
        })
      )
    );
    return args.rulebook_ids;
  },
});

export const rename = mutation({
  args: { rulebook_id: v.id('rulebooks'), name: v.string() },
  returns: rulebookMetadataValidator,
  handler: async (ctx, args) => {
    const { rulebook } = await requireRulebookOwner(ctx, args.rulebook_id);
    const name = parseName(args.name);
    const nameKey = await assertAvailableName(ctx, rulebook.ruleset_id, name, rulebook._id);
    const slug = await resolveUniqueSlug(ctx, rulebook.ruleset_id, name, rulebook._id);
    const updatedAt = nowIso();
    await ctx.db.patch('rulebooks', rulebook._id, {
      name,
      name_key: nameKey,
      slug,
      updated_at: updatedAt,
    });
    return metadataFrom({
      ...rulebook,
      name,
      name_key: nameKey,
      slug,
      updated_at: updatedAt,
    });
  },
});

export const softDelete = mutation({
  args: { rulebook_id: v.id('rulebooks') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { rulebook } = await requireRulebookOwner(ctx, args.rulebook_id);
    const now = nowIso();
    await ctx.db.patch('rulebooks', rulebook._id, {
      is_deleted: true,
      deleted_at: now,
      updated_at: now,
    });
    return null;
  },
});
