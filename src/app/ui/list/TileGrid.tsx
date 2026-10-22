import type { PropsWithChildren } from 'react';

import styles from './TileGrid.module.css';

/**
 * Openable tiles, as a grid.
 *
 * A List.
 * Callers hand it the tiles;
 * this owns their track size, gap and distribution.
 * Compact density fits catalogue previews into context rails.
 * The browse page and the container composition grid both wear it, which is what keeps their tiles the same size without a restated number.
 * Callers own the empty case.
 */
export function TileGrid({ children, density = 'default' }: PropsWithChildren<{ density?: 'default' | 'compact' }>) {
  return (
    <div className={styles.grid} data-density={density}>
      {children}
    </div>
  );
}
