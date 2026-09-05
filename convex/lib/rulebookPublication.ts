import { RULEBOOK_FIRST_PAGE_ASSET_TYPE } from '../../src/shared/asset-publishing/publication';
import { isPublicationAssetType, publishedHref } from '../../src/shared/asset-publishing/publicationTargets';
import { rulebookEditionContentsV1Schema } from '../../src/shared/rulebooks/contents';
import type { RulebookEditionContentsV1 } from '../../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../../src/shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById } from '../../src/shared/rulebooks/projectRenderDocument';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';
import { enqueuePublicationJob } from './publication';
import { contentsForRulebookEdition } from './rulebookEditionContents';

type RulebookPublicationReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
type EditionIdentity = Pick<Doc<'rulebook_editions'>, '_id' | 'rulebook_id' | 'edition_number' | 'contents'>;
type ResolvedAssetEntry = readonly [string, RulebookResolvedAssetsById[string]];

function referencedAssetIds(contents: RulebookEditionContentsV1) {
  return [
    ...new Set(
      Object.values(contents.pagesById).flatMap((page) =>
        Object.values(page.blocksById).flatMap((block) =>
          block.kind === 'asset-figure' && block.assetId ? [block.assetId] : []
        )
      )
    ),
  ];
}

async function publishedAssetImageUrl(ctx: RulebookPublicationReadCtx, asset: Doc<'assets'>) {
  if (!isPublicationAssetType(asset.type)) {
    return null;
  }
  const publications = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', asset.type).eq('asset_id', asset._id))
    .take(2);
  if (publications.length > 1) {
    throw new Error(`Publication invariant violated: duplicate ${asset.type} assets`);
  }
  const publication = publications[0];
  return publication ? publishedHref(asset.type, asset._id, publication.cache_token) : null;
}

async function resolveAssetEntry(ctx: RulebookPublicationReadCtx, assetId: string): Promise<ResolvedAssetEntry | null> {
  const id = ctx.db.normalizeId('assets', assetId);
  const asset = id ? await ctx.db.get('assets', id) : null;
  if (!asset || asset.is_deleted) {
    return null;
  }
  const imageUrl = await publishedAssetImageUrl(ctx, asset);
  return [
    assetId,
    {
      assetId,
      name: assetDisplayName(asset),
      type: asset.type,
      imageUrl,
    },
  ];
}

async function resolvedAssetsForEdition(ctx: RulebookPublicationReadCtx, contents: unknown) {
  const parsed = rulebookEditionContentsV1Schema.safeParse(contents);
  if (!parsed.success) {
    return null;
  }
  const entries = await Promise.all(referencedAssetIds(parsed.data).map((assetId) => resolveAssetEntry(ctx, assetId)));
  const assetsById = Object.fromEntries(entries.filter((entry) => entry !== null));
  return { assetsById, contents: parsed.data };
}

/** Resolves one immutable Edition and proves the complete publishable render document. */
export async function rulebookRenderDocumentForEdition(ctx: RulebookPublicationReadCtx, edition: EditionIdentity) {
  const resolved = await resolvedAssetsForEdition(ctx, await contentsForRulebookEdition(ctx, edition));
  if (!resolved) {
    return null;
  }
  try {
    return projectRulebookRenderDocument(resolved.contents, resolved.assetsById);
  } catch {
    return null;
  }
}

/**
 * The Edition's first rendered Page, or null when the stored Contents no longer project into a renderable document.
 * The projection parses, so a catalogue change that a permanent Edition predates surfaces here rather than as a throw.
 */
function firstRenderedPage(contents: RulebookEditionContentsV1, assetsById: RulebookResolvedAssetsById) {
  try {
    const document = projectRulebookRenderDocument(contents, assetsById);
    const firstPageId = document.pageOrder[0];
    return firstPageId ? (document.pagesById[firstPageId] ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Why one Edition contributed no first-page image.
 * An Edition keeps the V1 read contract that minted it, including formatted text whose canonical spelling later changed.
 * These skips therefore mean the stored structure is corrupt or has no first Page;
 * either row must be reported without ending a batch that can still publish its neighbours.
 */
export type RulebookFirstPageSkip = 'unreadable-contents' | 'no-first-page';

export type RulebookFirstPageEnqueueResult =
  | Readonly<{ enqueued: true }>
  | Readonly<{ enqueued: false; skipped: RulebookFirstPageSkip }>;

/** Builds and queues the immutable first-page image for one Edition, or reports why it could not. */
export async function enqueueRulebookFirstPagePublication(
  ctx: MutationCtx,
  edition: EditionIdentity
): Promise<RulebookFirstPageEnqueueResult> {
  const resolved = await resolvedAssetsForEdition(ctx, await contentsForRulebookEdition(ctx, edition));
  if (!resolved) {
    return { enqueued: false, skipped: 'unreadable-contents' };
  }
  const page = firstRenderedPage(resolved.contents, resolved.assetsById);
  if (!page) {
    return { enqueued: false, skipped: 'no-first-page' };
  }
  await enqueuePublicationJob(ctx, {
    assetType: RULEBOOK_FIRST_PAGE_ASSET_TYPE,
    assetId: edition._id,
    assetData: {
      rulebookId: edition.rulebook_id,
      editionId: edition._id,
      editionNumber: edition.edition_number,
      page,
    },
  });
  return { enqueued: true };
}

export type RulebookFirstPageCaptureStatus = 'scheduled' | 'in_progress' | 'failed' | null;

/** Projects the current image and any replacement work without hiding a usable image behind capture state. */
export async function rulebookFirstPagePublicationStatus(ctx: RulebookPublicationReadCtx, editionId: string) {
  const [assets, jobs] = await Promise.all([
    ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', RULEBOOK_FIRST_PAGE_ASSET_TYPE).eq('asset_id', editionId)
      )
      .take(2),
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) =>
        q.eq('asset_type', RULEBOOK_FIRST_PAGE_ASSET_TYPE).eq('asset_id', editionId)
      )
      .take(4),
  ]);
  if (assets.length > 1) {
    throw new Error('Publication invariant violated: duplicate Rulebook first-page assets');
  }
  const captureStatus: RulebookFirstPageCaptureStatus = jobs.some((job) => job.status === 'in_progress')
    ? 'in_progress'
    : jobs.some((job) => job.status === 'pending')
      ? 'scheduled'
      : jobs.some((job) => job.status === 'error')
        ? 'failed'
        : null;
  const asset = assets[0];
  return {
    imageUrl: asset ? publishedHref(RULEBOOK_FIRST_PAGE_ASSET_TYPE, asset.asset_id, asset.cache_token) : null,
    captureStatus,
  };
}
