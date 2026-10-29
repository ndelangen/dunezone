import { SpiceAsset } from '../../src/shared/assets/schema';
import { assetSupplySchema } from '../../src/shared/play/capture';

/** The printed fields the tutorial needs, without catalogue provenance or unrelated assets. */
export function tutorialSpiceBlows(supply: unknown) {
  const cards: Array<{ assetId: string; name: string; amount: number; territory: string }> = [];
  for (const { asset } of assetSupplySchema.parse(supply).members) {
    if (asset.type !== 'card-spice') {
      continue;
    }
    const data = SpiceAsset.parse(asset.data);
    const territory = data.board?.tints[0]?.territories[0];
    if (territory) {
      cards.push({ assetId: asset.id, name: asset.name, amount: data.amount, territory });
    }
  }
  return cards;
}
