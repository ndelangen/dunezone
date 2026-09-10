import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { COMPONENT_ASSET_TYPES } from '../src/shared/asset-publishing/componentGeometry';
import { resolveComponentDeliveryResponseSchema } from '../src/shared/asset-publishing/componentPublication';
import { TokenAsset, RectangleTokenAsset } from '../src/shared/assets/schema';
import { internalQuery } from './_generated/server';
import { currentFactionLeaderData } from './lib/publication';

/** The Worker checks live source availability before reading retained bytes or answering a conditional request. */
export const resolveDelivery = internalQuery({
  args: {
    assetId: v.string(),
    assetType: v.optional(v.union(...COMPONENT_ASSET_TYPES.map((type) => v.literal(type)))),
  },
  returns: zodToConvex(resolveComponentDeliveryResponseSchema),
  handler: async (ctx, { assetId, assetType = 'faction-leader' }) => {
    const normalizedId = ctx.db.normalizeId('assets', assetId.replace(/\.back$/, ''));
    const asset = assetType === 'faction-leader' || !normalizedId ? null : await ctx.db.get('assets', normalizedId);
    const token =
      asset && assetType.startsWith('token-')
        ? (assetType === 'token-enhance' ? RectangleTokenAsset : TokenAsset).safeParse(asset.data)
        : null;
    const removedBack = assetId.endsWith('.back') && (!token?.success || token.data.back.mode !== 'custom');
    const available =
      assetType === 'faction-leader'
        ? Boolean(await currentFactionLeaderData(ctx, assetId))
        : Boolean(asset && !asset.is_deleted && asset.type === assetType && !removedBack);
    if (!available) {
      return { ok: true as const, status: 'missing' as const };
    }
    const published = await ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', assetType).eq('asset_id', assetId))
      .unique();
    return published && (assetType === 'faction-leader' || published.component_geometry)
      ? {
          ok: true as const,
          status: 'found' as const,
          revision: published.cache_token,
          publishedAt: published.published_at,
        }
      : { ok: true as const, status: 'pending' as const };
  },
});
