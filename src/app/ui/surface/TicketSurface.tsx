import type { ReactNode } from 'react';

import { DarkSchemeIsland, darkSchemeIslandAttributes } from './DarkSchemeIsland';
import { Surface } from './Surface';
import styles from './TicketSurface.module.css';

/** The ticket's main part, a pane on the app's paper; what sits in it fills its height, so a line can sit at its foot. */
export function TicketMain({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <Surface padding="xl">
      <div className={styles.main}>{children}</div>
    </Surface>
  );
}

/** The ticket's stub, a pane on the table's dark ground, with a perforation along its edge once it sits beside the main part. */
export function TicketStub({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <DarkSchemeIsland>
      <div className={styles.stub} {...darkSchemeIslandAttributes}>
        <Surface padding="xl" tone="ground">
          {children}
        </Surface>
      </div>
    </DarkSchemeIsland>
  );
}
