import type { SpiceTint } from '@shared/assets/schema';
import { arrakisBoard } from '@shared/boards/geometry';
import { CanvasScale } from '@ui/layout/CanvasScale';
import type { z } from 'zod';

import { SpiceBoardMap } from '@game/assets/card/SpiceBoardMap';

import styles from './TintBoard.module.css';

type Tint = z.infer<typeof SpiceTint>;

const board = arrakisBoard();

const STRONGHOLDS: Tint = {
  id: 'strongholds',
  name: 'Strongholds',
  color: '#2f7fe0',
  territories: [],
  types: ['stronghold'],
};
const SPICE_BLOW: Tint = {
  id: 'spice-blow',
  name: 'Spice Blow',
  color: '#e8b923',
  territories: ['the-great-flat', 'funeral-plain', 'habbanya-erg'],
};
const STORM_LINE: Tint = {
  id: 'storm',
  name: 'Storm',
  color: '#d63a2a',
  outline: true,
  territories: ['cielago-north', 'cielago-depression', 'cielago-south', 'meridian'],
};

/* What the board shows for each term; any other term, or none, shows the resting picture. */
const TINTS: Record<string, readonly Tint[]> = {
  tint: [STRONGHOLDS, SPICE_BLOW, STORM_LINE],
  sticker: [
    { ...STRONGHOLDS, stamps: ['city'] },
    { ...SPICE_BLOW, stamps: ['spice'] },
  ],
  'board-asset': [],
};
const RESTING = [STRONGHOLDS];

/* The Spice card draws its map at this place and size on its own canvas; the frame crops the card down to the map. */
const MAP = { x: 95, y: 235, size: 700 };

/** The board of Arrakis with the tints the term the reader points at is about, drawn by the same renderer Spice cards use. */
export function TintBoard({ term }: Readonly<{ term: string | null }>) {
  const tints = (term ? TINTS[term] : undefined) ?? RESTING;
  return (
    <CanvasScale canvasWidth={MAP.size} canvasHeight={MAP.size} frameClassName={styles.frame}>
      <div
        className={styles.card}
        style={{ left: -MAP.x, top: -MAP.y }}
        role="img"
        aria-label="The board of Arrakis with tinted territories"
      >
        <SpiceBoardMap board={board} tints={tints} look={{ style: 'plain', strength: 1 }} />
      </div>
    </CanvasScale>
  );
}
