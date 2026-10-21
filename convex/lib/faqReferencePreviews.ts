import { v } from 'convex/values';

import { assetBrowseEntryValidator, toAssetCatalogueEntry } from '../assets';
import type { QueryCtx } from '../types';
import { catalogueFactionValidator } from './collaborativeAccessValidators';
import { listFactionRulesets, toCatalogueFaction } from './factionCatalogue';
import type { liveFaqReferenceTarget } from './faqReferences';

export const faqReferencePreviewValidator = v.union(
  v.object({ kind: v.literal('faction'), id: v.id('factions'), faction: catalogueFactionValidator }),
  v.object({ kind: v.literal('asset'), id: v.id('assets'), asset: assetBrowseEntryValidator })
);

export async function faqReferencePreview(
  ctx: QueryCtx,
  target: NonNullable<Awaited<ReturnType<typeof liveFaqReferenceTarget>>>
) {
  if (target.kind === 'faction') {
    return {
      kind: 'faction' as const,
      id: target.faction._id,
      faction: toCatalogueFaction(target.faction, await listFactionRulesets(ctx, target.faction._id)),
    };
  }
  return { kind: 'asset' as const, id: target.asset._id, asset: await toAssetCatalogueEntry(ctx, target.asset) };
}
