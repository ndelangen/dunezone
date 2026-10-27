import type { ReactNode } from 'react';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import { Surface } from './Surface';
import styles from './TicketSurface.module.css';

/**
 * A ticket: the main part on the app's paper and a stub on the dark ground, with a perforation between them on a wide page.
 * The two sit side by side once the page frame is 48rem wide, and stack below that.
 * The stub's ground and accent are `--ticket-ground` and `--ticket-accent`, which whatever sits inside it can read.
 */
export function TicketSurface({ main, stub }: Readonly<{ main: ReactNode; stub: ReactNode }>) {
  return (
    <div className={styles.ticket}>
      <Surface padding="xl">
        <div className={styles.main}>{main}</div>
      </Surface>
      <DarkSchemeIsland>
        <div className={styles.stub} {...darkSchemeIslandAttributes}>
          <Surface padding="xl">{stub}</Surface>
        </div>
      </DarkSchemeIsland>
    </div>
  );
}
