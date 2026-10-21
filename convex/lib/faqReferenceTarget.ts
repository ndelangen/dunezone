import type { Infer } from 'convex/values';
import { v } from 'convex/values';

import type { MutationCtx, QueryCtx } from '../types';

export const faqReferenceTargets = {
  faction: v.object({ kind: v.literal('faction'), id: v.id('factions') }),
  asset: v.object({ kind: v.literal('asset'), id: v.id('assets') }),
};

export const faqReferenceTargetValidator = v.union(faqReferenceTargets.faction, faqReferenceTargets.asset);

export type FaqReferenceTarget = Infer<typeof faqReferenceTargetValidator>;

/** The same live-target projection used by faction relationships: retain links and skip unavailable targets. */
export async function liveFaqReferenceTarget(ctx: QueryCtx | MutationCtx, target: FaqReferenceTarget) {
  if (target.kind === 'faction') {
    const faction = await ctx.db.get('factions', target.id);
    return faction && !faction.is_deleted ? { kind: 'faction' as const, faction } : null;
  }
  const asset = await ctx.db.get('assets', target.id);
  return asset && !asset.is_deleted ? { kind: 'asset' as const, asset } : null;
}
