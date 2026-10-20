import { CanonicalFactionStoredObject, TroopArtwork } from '../../../src/shared/factions/schema';
import type { RulebookRenderBlockV1 } from '../../../src/shared/rulebooks/renderDocument';
import gf9Package from '../package.json';

/** Three ordinary Atreides forces ship from reserves to a stronghold in the Basic Game. */
export function shipmentIllustration(): RulebookRenderBlockV1 {
  const entry = gf9Package.items.find(({ key }) => key === 'gf9-atreides');
  const data = CanonicalFactionStoredObject.pick({
    logo: true,
    background: true,
    themeColor: true,
    troops: true,
  }).strip().parse(entry?.data);
  const troop = TroopArtwork.strip().parse(data.troops[0]);
  const faction = {
    status: 'ready' as const,
    factionId: 'gf9-atreides',
    name: 'Atreides',
    color: data.themeColor,
    token: { logo: data.logo, background: data.background },
  };
  const force = (id: string, label: string) => ({
    id,
    kind: 'troops' as const,
    faction,
    troopId: troop.troopId,
    face: 'front' as const,
    count: 3,
    artwork: troop,
    label,
  });
  return {
    id: 'shipment-three-forces',
    kind: 'piece-transfer',
    direction: 'right',
    left: { label: 'Reserves', pieces: [force('shipment-reserves', '3 ordinary forces')] },
    right: { label: 'Arrakeen', pieces: [force('shipment-arrakeen', 'Basic shipment: 3 spice')] },
  };
}
