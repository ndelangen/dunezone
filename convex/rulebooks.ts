import { v } from 'convex/values';

import { isPublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import { createRulebookLocalId, rulebookContentsV1Schema } from '../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../src/shared/rulebooks/contents';
import { createRulebookEditorialStarterContents } from '../src/shared/rulebooks/fixtures';
import { rulebookNameKey, rulebookNameSchema, rulebookRevisionSchema } from '../src/shared/rulebooks/metadata';
import type { Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { publicationStatusFor } from './assetPublishingStatus';
import { mutation } from './functions';
import { assetDisplayName } from './lib/assetInput';
import { loadRulesetAccessForLoadedSubject, requireRulesetMaintenance } from './lib/collaborativeAccess';
import { rulesetViewerAccessValidator } from './lib/collaborativeAccessValidators';
import { requireAuthUserId } from './lib/policy';
import {
  listRulesetRulebooks,
  rulebookMetadata as metadataFrom,
  rulebookMetadataValidator,
  rulebookListEntryValidator,
} from './lib/rulebookList';
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

const editorBundleValidator = v.object({
  rulebook: rulebookMetadataValidator,
  draft: savedDraftValidator,
  edition: editionValidator,
});

const saveResultValidator = v.union(
  v.object({ kind: v.literal('saved'), draft: savedDraftValidator }),
  v.object({ kind: v.literal('stale'), draft: savedDraftValidator })
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
  return { ...edition, contents: parseContents(edition.contents) };
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
type RepeatedTextBlock = Extract<RulebookBlock, { kind: 'repeated-text' }>;

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

function cloneRepeatedTextBlock(source: RepeatedTextBlock, id: string): RepeatedTextBlock {
  const itemIds = freshIdentityMap(source.itemOrder);
  return {
    ...structuredClone(source),
    id,
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
  return source.kind === 'repeated-text' ? cloneRepeatedTextBlock(source, id) : { ...structuredClone(source), id };
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

type RulebookCreationSource = { kind: 'starter' } | { kind: 'clone'; rulebook_id: Id<'rulebooks'> };

async function contentsForCreation(ctx: MutationCtx, rulesetId: Id<'rulesets'>, source: RulebookCreationSource) {
  if (source.kind === 'starter') {
    return createRulebookEditorialStarterContents();
  }
  const sourceRulebook = await rulebookById(ctx, source.rulebook_id);
  if (sourceRulebook.ruleset_id !== rulesetId) {
    throw new Error('Rulebook clone source must belong to the same Ruleset');
  }
  return cloneContentsWithFreshIds((await draftFor(ctx, sourceRulebook._id)).contents);
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
  }
) {
  const now = nowIso();
  const rulebookId = await ctx.db.insert('rulebooks', {
    ruleset_id: input.rulesetId,
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
    edition_number: 1,
    contents: input.contents,
    created_by: input.viewerId,
    created_at: now,
  });
  const [rulebook, draft, edition] = await Promise.all([
    ctx.db.get('rulebooks', rulebookId),
    ctx.db.get('rulebook_drafts', draftId),
    ctx.db.get('rulebook_editions', editionId),
  ]);
  return {
    rulebook: metadataFrom(createdDocument(rulebook)),
    draft: createdDocument(draft),
    edition: createdDocument(edition),
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
      ruleset: v.object({ _id: v.id('rulesets'), name: v.string(), slug: v.string() }),
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

async function assetsForContents(ctx: QueryCtx, contents: RulebookContentsV1) {
  const assetIds = new Set(
    Object.values(contents.pagesById).flatMap((page) =>
      Object.values(page.blocksById).flatMap((block) =>
        block.kind === 'asset-figure' && block.assetId ? [block.assetId] : []
      )
    )
  );
  const assets = await Promise.all(
    [...assetIds].map(async (assetId) => {
      const id = ctx.db.normalizeId('assets', assetId);
      const asset = id ? await ctx.db.get('assets', id) : null;
      if (!asset || asset.is_deleted) {
        return [];
      }
      const published = isPublicationAssetType(asset.type)
        ? await publicationStatusFor(ctx, asset.type, asset._id)
        : null;
      return [
        [
          assetId,
          { assetId, name: assetDisplayName(asset), type: asset.type, imageUrl: published?.publicationHref ?? null },
        ] as const,
      ];
    })
  );
  return Object.fromEntries(assets.flat());
}

/** Public reading loads only the current Edition, never the author's saved draft. */
export const readerPage = query({
  args: { ruleset_slug: v.string(), rulebook_slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      rulebook: rulebookMetadataValidator,
      edition: editionValidator.pick('edition_number', 'contents', 'created_at'),
      assetsById: resolvedAssetsValidator,
    })
  ),
  handler: async (ctx, args) => {
    const found = await rulebookAtSlugs(ctx, args);
    if (!found) {
      return null;
    }
    const { rulebook } = found;
    const { edition_number, contents, created_at } = await editionFor(
      ctx,
      rulebook._id,
      rulebook.current_edition_number
    );
    return {
      rulebook: metadataFrom(rulebook),
      edition: { edition_number, contents, created_at },
      assetsById: await assetsForContents(ctx, contents),
    };
  },
});

/** The editor's one subscription checks access before loading private draft Contents. */
export const editorPage = query({
  args: { ruleset_slug: v.string(), rulebook_slug: v.string() },
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
      assetsById: resolvedAssetsValidator,
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
    return {
      kind: 'editable' as const,
      canRename: viewerAccess.capabilities.rename,
      rulebook: metadata,
      draft,
      assetsById: await assetsForContents(ctx, draft.contents),
    };
  },
});

export const create = mutation({
  args: {
    ruleset_id: v.id('rulesets'),
    name: v.string(),
    source: v.union(
      v.object({ kind: v.literal('starter') }),
      v.object({ kind: v.literal('clone'), rulebook_id: v.id('rulebooks') })
    ),
  },
  returns: editorBundleValidator,
  handler: async (ctx, args) => {
    await requireRulesetMaintenance(ctx, args.ruleset_id);
    const viewerId = await requireAuthUserId(ctx);
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
      contents: await contentsForCreation(ctx, args.ruleset_id, args.source),
    });
  },
});

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
