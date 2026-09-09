import { z } from 'zod';

import type { RulebookContentsDraftV1 } from './contents';

export const rulebookResolvedFactionSchema = z.strictObject({
  factionId: z.string(),
  name: z.string(),
  color: z.string(),
});
export const rulebookResolvedFactionsByIdSchema = z.record(z.string(), rulebookResolvedFactionSchema);
export type RulebookResolvedFactionsById = Readonly<
  Record<string, Readonly<z.infer<typeof rulebookResolvedFactionSchema>>>
>;

/** Collects selected live sources once, including unsaved picks, in a stable order for query inputs. */
export function collectRulebookReferenceIds(
  contents: RulebookContentsDraftV1,
  requested: { assetIds?: readonly string[]; factionIds?: readonly string[] } = {}
) {
  const assetIds = new Set(requested.assetIds);
  const factionIds = new Set(requested.factionIds);
  for (const page of Object.values(contents.pagesById)) {
    if (page.layoutId === 'cover' && page.controlValues.cover.artworkAssetId) {
      assetIds.add(page.controlValues.cover.artworkAssetId);
    }
    for (const block of Object.values(page.blocksById)) {
      if (block.kind === 'asset-figure' && block.assetId) {
        assetIds.add(block.assetId);
      }
      if (block.kind === 'section-heading' && block.factionId) {
        factionIds.add(block.factionId);
      }
    }
  }
  return { assetIds: [...assetIds].sort(), factionIds: [...factionIds].sort() };
}
