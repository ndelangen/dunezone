import { zodToConvex } from 'convex-helpers/server/zod4';
import { v } from 'convex/values';

import { resolveComponentDeliveryResponseSchema } from '../src/shared/asset-publishing/componentPublication';
import { internalQuery } from './_generated/server';
import { currentFactionLeaderData } from './lib/publication';

/** The Worker checks live source availability before reading retained bytes or answering a conditional request. */
export const resolveDelivery = internalQuery({
  args: { assetId: v.string() },
  returns: zodToConvex(resolveComponentDeliveryResponseSchema),
  handler: async (ctx, { assetId }) => {
    if (!(await currentFactionLeaderData(ctx, assetId))) {
      return { ok: true as const, status: 'missing' as const };
    }
    const published = await ctx.db
      .query('publication_assets')
      .withIndex('by_asset_type_and_asset_id', (q) => q.eq('asset_type', 'faction-leader').eq('asset_id', assetId))
      .unique();
    return published
      ? {
          ok: true as const,
          status: 'found' as const,
          revision: published.cache_token,
          publishedAt: published.published_at,
        }
      : { ok: true as const, status: 'pending' as const };
  },
});
