import { CanvasScale } from '@ui/layout/CanvasScale';
import type { ReactNode } from 'react';

import { card as CARD_SIZE } from '@game/data/sizes';

import styles from './CardEditor.module.css';

/** The card being edited, scaled to the rail with rounded corners and the proof's shadow, so every card editor shows its proof the same way. */
export function CardProof({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <CanvasScale
      rounded
      canvasWidth={CARD_SIZE.width}
      canvasHeight={CARD_SIZE.height}
      frameClassName={styles.proofFrame}
    >
      {children}
    </CanvasScale>
  );
}
