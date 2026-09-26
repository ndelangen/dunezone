import type { z } from 'zod';

import type { assetCaptureStatusSchema } from '../src/shared/asset-publishing/captureStatus';
import { publishedHref } from '../src/shared/asset-publishing/publicationTargets';
import type { PublicationAssetType } from '../src/shared/asset-publishing/publicationTargets';
import type { Doc } from './_generated/dataModel';
import type { QueryCtx } from './types';

export type PublicAssetPublishingStatus = 'current';
export type PublicAssetCaptureStatus = z.infer<typeof assetCaptureStatusSchema>;

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

  return {
    ...projectPublicAssetPublishingStatus(assetType, assets[0] ?? null),
    captureStatus: captureStatusOf(jobs),
  };
}

/** Live work outranks a failure, because a running or waiting capture may still replace the publication the failed one could not. */
function captureStatusOf(jobs: Pick<Doc<'publication_jobs'>, 'status'>[]): PublicAssetCaptureStatus | null {
  const has = (status: Doc<'publication_jobs'>['status']) => jobs.some((job) => job.status === status);
  switch (true) {
    case has('in_progress'):
      return 'in_progress';
    case has('pending'):
      return 'scheduled';
    case has('error'):
      return 'error';
    default:
      return null;
  }
}
