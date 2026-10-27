import type { ReactNode } from 'react';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import { Surface } from './Surface';
import styles from './TicketSurface.module.css';

/**
 * A ticket's paper: the rounded edge and the shadow it casts, round a `TicketLayout` that places its parts.
 * Its stub's ground and accent are `--ticket-ground` and `--ticket-accent`, which whatever sits inside can read.
 */
export function TicketSurface({ children }: Readonly<{ children: ReactNode }>) {
  return <div className={styles.ticket}>{children}</div>;
}

/** The ticket's main part, on the app's paper; what sits in it fills its height, so a line can sit at its foot. */
export function TicketMain({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Surface padding="xl">
      <div className={styles.main}>{children}</div>
    </Surface>
  );
}

/** The ticket's stub, on the table's dark ground, with a perforation along its edge once it sits beside the main part. */
export function TicketStub({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <DarkSchemeIsland>
      <div className={styles.stub} {...darkSchemeIslandAttributes}>
        <Surface padding="xl">{children}</Surface>
      </div>
    </DarkSchemeIsland>
  );
}
