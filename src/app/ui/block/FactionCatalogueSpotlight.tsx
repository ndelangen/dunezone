import { Link } from '@tanstack/react-router';
import { Spotlight } from '@ui/surface/Spotlight';

import type { FactionCatalogueSpotlightData } from '@db/factions';
import { Token as FactionToken } from '@game/assets/faction/token/Token';

/**
 * Binds a faction to the generic spotlight row: its token as the artwork, its detail route as the destination.
 * Only the faction-shaped knowledge lives here; the row itself is shared.
 */
export function FactionCatalogueSpotlight({
  faction,
  label,
  meta,
}: {
  faction: FactionCatalogueSpotlightData;
  label: string;
  meta: string;
}) {
  return (
    <Spotlight
      media={<FactionToken logo={faction.data.logo} background={faction.data.background} />}
      eyebrow={label}
      title={faction.data.name}
      meta={meta}
      renderRoot={(rootProps) => <Link {...rootProps} to="/factions/$factionId" params={{ factionId: faction.slug }} />}
    />
  );
}
