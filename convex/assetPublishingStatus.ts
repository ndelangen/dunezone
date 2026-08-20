import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './types';

export type PublicAssetPublishingStatus = 'current';
export type PublicAssetCaptureStatus = 'scheduled' | 'in_progress';

export type PublicAssetPublishingStatusProjection = {
  status: PublicAssetPublishingStatus | null;
  captureStatus: PublicAssetCaptureStatus | null;
  publicationHref: string | null;
  lastPublishedAt: number | null;
};

type ProjectablePublicationAsset = Pick<Doc<'publication_assets'>, 'asset_id' | 'cache_token' | 'published_at'>;

/**
 * Once an asset exists, replacement work never removes or downgrades its public link.
 * Capture state is added separately by the caller's projection.
 */
export function projectPublicAssetPublishingStatus(
  assetType: PublicationAssetType,
  asset: ProjectablePublicationAsset | null
): PublicAssetPublishingStatusProjection {
  if (!asset) {
    return {
      status: null,
      captureStatus: null,
      publicationHref: null,
      lastPublishedAt: null,
    };
  }
  return {
    status: 'current',
    captureStatus: null,
    publicationHref: publishedHref(assetType, asset.asset_id, asset.cache_token),
    lastPublishedAt: asset.published_at,
  };
}

/**
 * One asset's publication state, for any type that publishes.
 *
 * Both tables key on the same `(asset_type, asset_id)` index, so a faction sheet and a treachery card read through exactly the same two queries and differ only in the strings handed to them.
 */
export async function publicationStatusFor(
  ctx: Pick<QueryCtx, 'db'>,
  assetType: PublicationAssetType,
  assetId: string
): Promise<PublicAssetPublishingStatusProjection> {
  const [assets, jobs] = await Promise.all([
    ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
      .take(2),
    ctx.db
      .query('publication_jobs')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
      .take(4),
  ]);
  if (assets.length > 1) {
    throw new Error(`Publication invariant violated: duplicate ${assetType} assets`);
  }

  const captureStatus: PublicAssetCaptureStatus | null = jobs.some((job) => job.status === 'in_progress')
    ? 'in_progress'
    : jobs.some((job) => job.status === 'pending')
      ? 'scheduled'
      : null;

  return {
    ...projectPublicAssetPublishingStatus(assetType, assets[0] ?? null),
    captureStatus,
  };
}

export async function factionSheetPublishingStatus(
  ctx: Pick<QueryCtx, 'db'>,
  factionId: Id<'factions'>
): Promise<PublicAssetPublishingStatusProjection> {
  return await publicationStatusFor(ctx, 'faction_sheet', factionId);
}
