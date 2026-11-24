import type { GameSnapshot } from '@shared/play/protocol';
import { revealedSpiceBlows } from '@shared/play/spiceBlowPlacement';
import type { SpiceBlowPin } from '@shared/play/spiceBlowSpot';
import { spiceBlowPins } from '@shared/play/spiceBlowSpot';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { playUiColors } from '@shared/uiPalette';
import { useMemo } from 'react';

import { useTabletopSelector } from './TabletopContext';

/* A light wash, so the map under it stays readable; the spice sticker says what it is for. */
const WASH = 'a6';

/* The territories the face-up spice cards name, the top card of each pile only, as one key, so the board redraws only when they change. */
function spiceBlowTerritoriesKey(pieces: Parameters<typeof revealedSpiceBlows>[0]): string {
  return [...new Set(revealedSpiceBlows(pieces).flatMap(({ blow }) => blow.territories))]
    .sort((a, b) => a.localeCompare(b))
    .join(' ');
}

/* The exact spots the face-up spice cards mark, as one key, so the board redraws only when they change. */
function pinsKey(pins: readonly SpiceBlowPin[]): string {
  return JSON.stringify(pins);
}

/**
 * The exact spots the face-up spice cards mark with their spice, where the table draws the spice sticker and the spice lands.
 */
export function useSpiceBlowPins(): readonly SpiceBlowPin[] {
  const key = useTabletopSelector((value) => pinsKey(spiceBlowPins(value.snapshot, value.state.pieces)));
  return useMemo(() => JSON.parse(key) as SpiceBlowPin[], [key]);
}

/**
 * The board's shared tints, with the territory each face-up spice card names lit on top (#2678), so the spice can be placed by hand, by the card's ring or by the Spice blow command.
 * A territory a card marks with an exact spot gets its spice sticker on that spot (see useSpiceBlowPins), not one where the territory has the most room.
 * The light is the page's own: it goes out when the card is turned down, covered or taken off the table.
 */
export function useBoardTints(): GameSnapshot['tints'] {
  const tints = useTabletopSelector((value) => value.snapshot.tints);
  const pending = useTabletopSelector((value) => spiceBlowTerritoriesKey(value.state.pieces));
  const pins = useSpiceBlowPins();
  return useMemo(() => {
    if (!pending) {
      return tints;
    }
    const pinned = new Set(pins.map(({ territory }) => territory));
    const territories = pending.split(' ');
    const color = `${playUiColors.spiceBlowTerritory}${WASH}`;
    const lit: TerritoryTint[] = [
      {
        id: 'spice-blow',
        name: 'Spice Blow',
        color,
        stamps: ['spice'],
        territories: territories.filter((id) => !pinned.has(id)),
      },
      { id: 'spice-blow-pinned', name: 'Spice Blow', color, territories: territories.filter((id) => pinned.has(id)) },
    ];
    return [...(tints ?? []), ...lit.filter((tint) => tint.territories.length)];
  }, [tints, pending, pins]);
}
