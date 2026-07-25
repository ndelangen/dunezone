import type { Doc, Id } from './_generated/dataModel';
import type { QueryCtx } from './types';

export type PublicAssetPublishingStatus = 'current';

export type PublicAssetPublishingStatusProjection = {
  status: PublicAssetPublishingStatus | null;
  publicationHref: string | null;
  lastPublishedAt: number | null;
};

type ProjectablePublicationAsset = Pick<
  Doc<'publication_assets'>,
  'asset_id' | 'cache_token' | 'published_at'
>;

/**
 * Public state is deliberately independent from ephemeral job state. Once an
 * asset exists, replacement work never removes or downgrades its public link.
 */
export function projectPublicAssetPublishingStatus(
  asset: ProjectablePublicationAsset | null
): PublicAssetPublishingStatusProjection {
  if (!asset) return { status: null, publicationHref: null, lastPublishedAt: null };
  return {
    status: 'current',
    publicationHref: `/published/factions/${encodeURIComponent(asset.asset_id)}/sheet.pdf?v=${encodeURIComponent(asset.cache_token)}`,
    lastPublishedAt: asset.published_at,
  };
}

export async function factionSheetPublishingStatus(
  ctx: Pick<QueryCtx, 'db'>,
  factionId: Id<'factions'>
): Promise<PublicAssetPublishingStatusProjection> {
  const assets = await ctx.db
    .query('publication_assets')
    .withIndex('by_asset_type_and_asset_id', (q) =>
      q.eq('asset_type', 'faction_sheet').eq('asset_id', factionId)
    )
    .take(2);
  if (assets.length > 1) {
    throw new Error('Publication invariant violated: duplicate faction-sheet assets');
  }
  return projectPublicAssetPublishingStatus(assets[0] ?? null);
}
