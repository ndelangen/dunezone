import { assetSupplySchema } from '../../src/shared/play/capture';
import { spiceBlowOf } from '../../src/shared/play/spiceBlow';

/**
 * Where each recorded spice card puts its spice, read from the card as the game reads it when a live game takes it in (#2678), without catalogue provenance or unrelated assets.
 * A card that names no territory, such as Shai-Hulud, is left out.
 */
export function tutorialSpiceBlows(supply: unknown) {
  return assetSupplySchema.parse(supply).members.flatMap(({ asset }) => {
    const spiceBlow = spiceBlowOf(asset.type, asset.data);
    return spiceBlow ? [{ assetId: asset.id, name: asset.name, spiceBlow }] : [];
  });
}
