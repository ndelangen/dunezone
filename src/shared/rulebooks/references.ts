import { z } from 'zod';

import type { RulebookContentsDraftV1 } from './contents';
import { rulebookResolvedSourceSchema } from './sources';
import type { RulebookSourceReference } from './sources';

export const rulebookResolvedFactionSchema = z.strictObject({
  factionId: z.string(),
  name: z.string(),
  color: z.string(),
  emblemUrl: z.string().optional(),
  ruler: rulebookResolvedSourceSchema.optional(),
  leaders: z.array(rulebookResolvedSourceSchema).optional(),
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
  const collectSource = (source: RulebookSourceReference | undefined) => {
    if (source?.kind === 'asset') {
      assetIds.add(source.assetId);
    }
    if (source?.kind === 'faction' || source?.kind === 'faction-member') {
      factionIds.add(source.factionId);
    }
  };
  for (const page of Object.values(contents.pagesById)) {
    if (page.layoutId === 'cover' && page.controlValues.cover.artworkAssetId) {
      assetIds.add(page.controlValues.cover.artworkAssetId);
    }
    for (const block of Object.values(page.blocksById)) {
      if (block.kind === 'asset-figure' && block.assetId) {
        assetIds.add(block.assetId);
      }
      if ((block.kind === 'section-heading' || block.kind === 'faction-introduction') && block.factionId) {
        factionIds.add(block.factionId);
      }
      if (block.kind === 'referenced-illustration' || block.kind === 'card-entry') {
        collectSource(block.source);
      }
      if (block.kind === 'illustrated-inventory' || block.kind === 'card-group') {
        for (const item of Object.values(block.itemsById)) {
          collectSource(item.source);
        }
      }
    }
  }
  return { assetIds: [...assetIds].sort(), factionIds: [...factionIds].sort() };
}
