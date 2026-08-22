import type { PropsWithChildren } from 'react';

import styles from './TileGrid.module.css';

/**
 * Openable tiles, as a grid.
 *
 * A List, callers hand it the tiles and this owns only the rhythm between them: one track size, one gap, one distribution, shared by every surface that answers "which of these do you want to open" with pictures.
 * The browse page and the container composition grid both wear it, which is what keeps their tiles the same size without a restated number.
 * Callers own the empty case.
 */
export function TileGrid({ children }: PropsWithChildren) {
  return <div className={styles.grid}>{children}</div>;
}
