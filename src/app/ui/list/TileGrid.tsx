import { Children } from 'react';
import type { ReactNode } from 'react';

import styles from './TileGrid.module.css';

/**
 * How big each tile is, which is all that sets the columns:
 * `tile` for catalogue previews, `compact` for previews in a context rail, `card` for faction cards (two, three, then as many as fit at 11.5rem), `wide` for titled cards with a figure and caption (one, two from 30rem, three from 62rem).
 */
type TileSize = 'tile' | 'compact' | 'card' | 'wide';

export interface TileGridProps {
  /** The tiles, in reading order. Each becomes one list item. */
  children: ReactNode;
  /** The tile size, `tile` by default. */
  size?: TileSize;
  /** Names the list for assistive tech, where no heading above it does. */
  'aria-label'?: string;
}

/**
 * Tiles, as a grid: the one list every catalogue, lobby and faction row wears.
 *
 * A List.
 * Callers hand it the tiles;
 * this owns that they are a list, their track size, gap and distribution, and how the columns answer to the list's own width.
 * A tile fills its cell, so tiles in a row share their width and height, and callers never size a tile.
 * Callers own the empty case.
 */
export function TileGrid({ children, size = 'tile', 'aria-label': ariaLabel }: TileGridProps) {
  return (
    <div className={styles.room} data-size={size}>
      <ul className={styles.grid} aria-label={ariaLabel}>
        {Children.toArray(children).map((child, index) => (
          <li key={(child as { key?: string | null }).key ?? index} className={styles.cell}>
            {child}
          </li>
        ))}
      </ul>
    </div>
  );
}
