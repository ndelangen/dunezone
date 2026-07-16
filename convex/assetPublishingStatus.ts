import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import type { QueryCtx } from './types';

export type PublicAssetPublishingStatus = 'waiting' | 'publishing' | 'delayed' | 'current';

export type PublicAssetPublishingStatusProjection = {
  status: PublicAssetPublishingStatus | null;
};

type ProjectableTarget = Pick<
  Doc<'asset_targets'>,
  | 'status'
  | 'desired_generation'
  | 'desired_renderer_version'
  | 'published_generation'
  | 'published_renderer_version'
>;

/**
 * The only target state allowed across the public application boundary.
 * Operational errors, attempts, claims, leases, payloads, and publication
 * metadata intentionally never enter this projection.
 */
export function projectPublicAssetPublishingStatus(
  target: ProjectableTarget | null
): PublicAssetPublishingStatusProjection {
  if (!target) return { status: null };

  if (target.status === 'leased') return { status: 'publishing' };
  if (target.status === 'cooldown') return { status: 'delayed' };
  if (
    target.status === 'current' &&
    target.desired_generation === target.published_generation &&
    target.desired_renderer_version === target.published_renderer_version
  ) {
    return { status: 'current' };
  }
  return { status: 'waiting' };
}

export async function factionSheetPublishingStatus(
  ctx: Pick<QueryCtx, 'db'>,
  factionId: Id<'factions'>
): Promise<PublicAssetPublishingStatusProjection> {
  const targets = await ctx.db
    .query('asset_targets')
    .withIndex('by_faction_id_and_asset_type', (q) =>
      q.eq('faction_id', factionId).eq('asset_type', 'faction_sheet')
    )
    .take(2);
  if (targets.length > 1) {
    throw new Error('Asset publisher invariant violated: duplicate faction-sheet targets');
  }
  return projectPublicAssetPublishingStatus(targets[0] ?? null);
}

export const getFactionSheet = query({
  args: { factionId: v.id('factions') },
  handler: async (ctx, args) => await factionSheetPublishingStatus(ctx, args.factionId),
});
