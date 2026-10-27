import type { ReactNode } from 'react';

import styles from './CardGrid.module.css';

export interface CardGridProps {
  /** Names the list for assistive tech, since a grid of cards has no heading of its own. */
  'aria-label': string;
  /** `CardGrid.Item` elements. */
  children: ReactNode;
}

/**
 * A list of cards in a grid that asks its own width: one column, two from 30rem, three from 62rem.
 *
 * Callers own the cards;
 * this component owns that they are a list and how many sit in a row.
 * Its width is the `card-grid` container, which a card's own arrangement may read, as `FigureCaptionLayout` does.
 */
export function CardGrid({ 'aria-label': ariaLabel, children }: CardGridProps) {
  return (
    <div className={styles.room}>
      <ul className={styles.grid} aria-label={ariaLabel}>
        {children}
      </ul>
    </div>
  );
}

/** One card of a `CardGrid`, stretched to its cell so the cards in a row share their height. */
function Item({ children }: Readonly<{ children: ReactNode }>) {
  return <li className={styles.cell}>{children}</li>;
}

CardGrid.Item = Item;
