import type { GameSnapshot } from '@shared/play/protocol';
import { revealedSpiceBlows } from '@shared/play/spiceBlowPlacement';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { playUiColors } from '@shared/uiPalette';
import { useMemo } from 'react';

import { useTabletopSelector } from './TabletopContext';

/* A light wash, so the map under it stays readable; the spice sticker says what it is for. */
const WASH = 'a6';

/* The territories the face-up spice cards name, the top card of each pile only, as one key, so the board redraws only when they change. */
function spiceBlowTerritoriesKey(pieces: Parameters<typeof revealedSpiceBlows>[0]): string {
  return [...new Set(revealedSpiceBlows(pieces).flatMap(({ blow }) => blow.territories))].sort().join(' ');
}

/**
 * The board's shared tints, with the territory each face-up spice card names lit on top (#2678), so the spice can be placed by hand, by the card's ring or by the Spice blow command.
 * The light is the page's own: it goes out when the card is turned down, covered or taken off the table.
 */
export function useBoardTints(): GameSnapshot['tints'] {
  const tints = useTabletopSelector((value) => value.snapshot.tints);
  const pending = useTabletopSelector((value) => spiceBlowTerritoriesKey(value.state.pieces));
  return useMemo(() => {
    if (!pending) {
      return tints;
    }
    const blow: TerritoryTint = {
      id: 'spice-blow',
      name: 'Spice Blow',
      color: `${playUiColors.spiceBlowTerritory}${WASH}`,
      stamps: ['spice'],
      territories: pending.split(' '),
    };
    return [...(tints ?? []), blow];
  }, [tints, pending]);
}
