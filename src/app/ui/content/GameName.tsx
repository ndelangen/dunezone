import clsx from 'clsx';

import styles from './GameName.module.css';

export interface GameNameProps {
  /** The game's name. */
  children: string;
  /** A name not settled yet, such as a generated one waiting for a custom name to be typed: it shows faded. */
  pending?: boolean;
}

/**
 * A game's name printed large, as on a ticket.
 *
 * Callers own the name and whether it is settled;
 * this component owns the display face, its size against its container's width, and how a long name wraps.
 * It announces a changed name, since a new one is drawn without the reader moving.
 */
export function GameName({ children, pending = false }: GameNameProps) {
  return (
    <p className={clsx(styles.name, pending && styles.pending)} aria-live="polite">
      {children}
    </p>
  );
}
