import { RULEBOOK_FIRST_PAGE_ASSET_TYPE } from '../../src/shared/asset-publishing/publication';
import { isPublicationAssetType, publishedHref } from '../../src/shared/asset-publishing/publicationTargets';
import { rulebookContentsV1Schema } from '../../src/shared/rulebooks/contents';
import type { RulebookContentsV1 } from '../../src/shared/rulebooks/contents';
import { projectRulebookRenderDocument } from '../../src/shared/rulebooks/projectRenderDocument';
import type { RulebookResolvedAssetsById } from '../../src/shared/rulebooks/projectRenderDocument';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../types';
import { assetDisplayName } from './assetInput';
import { enqueuePublicationJob } from './publication';

type RulebookPublicationReadCtx = Pick<QueryCtx, 'db'> | Pick<MutationCtx, 'db'>;
type EditionIdentity = Pick<Doc<'rulebook_editions'>, '_id' | 'rulebook_id' | 'edition_number' | 'contents'>;
type ResolvedAssetEntry = readonly [string, RulebookResolvedAssetsById[string]];

function referencedAssetIds(contents: RulebookContentsV1) {
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
  const parsed = rulebookContentsV1Schema.parse(contents);
  const entries = await Promise.all(referencedAssetIds(parsed).map((assetId) => resolveAssetEntry(ctx, assetId)));
  const assetsById = Object.fromEntries(entries.filter((entry) => entry !== null));
  return { assetsById, contents: parsed };
}

/** Builds and queues the immutable first-page image for one Edition. */
export async function enqueueRulebookFirstPagePublication(ctx: MutationCtx, edition: EditionIdentity) {
  const { assetsById, contents } = await resolvedAssetsForEdition(ctx, edition.contents);
  const document = projectRulebookRenderDocument(contents, assetsById);
  const firstPageId = document.pageOrder[0];
  const page = firstPageId ? document.pagesById[firstPageId] : undefined;
  if (!page) {
    throw new Error('Rulebook Edition has no first Page');
  }
  return await enqueuePublicationJob(ctx, {
    assetType: RULEBOOK_FIRST_PAGE_ASSET_TYPE,
    assetId: edition._id,
    assetData: {
      rulebookId: edition.rulebook_id,
      editionId: edition._id,
      editionNumber: edition.edition_number,
      page,
    },
  });
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
