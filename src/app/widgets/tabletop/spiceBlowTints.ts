import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { revealedSpiceBlows } from '@shared/play/spiceBlowPlacement';
import type { TerritoryTint } from '@shared/play/territoryTints';
import { playUiColors } from '@shared/uiPalette';
import { useMemo } from 'react';

import { useTabletopSelector } from './TabletopContext';

/* A light wash, so the map under it stays readable; the spice sticker says what it is for. */
const WASH = 'a6';

/* The territories revealed spice cards name, as one key, so the board redraws only when they change. */
export function spiceBlowTerritoriesKey(
  snapshot: GameSnapshot,
  pieces: Parameters<typeof revealedSpiceBlows>[0]
): string {
  const phases = snapshot.phases ?? STANDARD_PHASES;
  if (snapshot.stage !== 'play' || phaseAt(snapshot.phase, phases).id !== 'spice-blow') {
    return '';
  }
  return [...new Set(revealedSpiceBlows(pieces).flatMap(({ blow }) => blow.territories))].sort().join(' ');
}

/**
 * The board's shared tints, with the territories revealed spice cards name lit on top during Spice Blow (#2678).
 * The light is the page's own: it goes out when the card leaves the table's face-up cards or the phase moves on.
 */
export function useBoardTints(): GameSnapshot['tints'] {
  const tints = useTabletopSelector((value) => value.snapshot.tints);
  const pending = useTabletopSelector((value) => spiceBlowTerritoriesKey(value.snapshot, value.state.pieces));
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
