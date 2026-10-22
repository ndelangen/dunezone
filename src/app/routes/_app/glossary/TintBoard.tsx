import { arrakisBoard } from '@shared/boards/geometry';
import type { BoardTint } from '@shared/boards/markup';
import { CanvasScale } from '@ui/layout/CanvasScale';

import { SpiceBoardMap } from '@game/assets/card/SpiceBoardMap';

import styles from './TintBoard.module.css';

const board = arrakisBoard();

/* The Spice card draws its map at this place and size on its own canvas; the frame crops the card down to the map. */
const MAP = { x: 95, y: 235, size: 700 };

/** Draws the supplied tints with the same renderer Spice cards use. */
export function TintBoard({ tints }: Readonly<{ tints: readonly BoardTint[] }>) {
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
