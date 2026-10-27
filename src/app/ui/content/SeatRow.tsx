import type { CSSProperties } from 'react';

import styles from './SeatRow.module.css';

/**
 * Every seat a table can have, in a row and numbered: the table's own seats lit, the first marked as the viewer's, and the rest left as the places a larger table would add.
 * It is a picture of a count shown in words beside it, so it is hidden from assistive technology.
 */
export function SeatRow({
  seats,
  places,
  perRow = 9,
  first = 'You',
}: Readonly<{
  /** How many seats the table has. */
  seats: number;
  /** How many seats a table can have at most: the row's length. */
  places: number;
  /** How many seats sit side by side before the row wraps onto the next line. */
  perRow?: number;
  /** What the first seat says in place of its number. */
  first?: string;
}>) {
  return (
    <ol className={styles.row} style={{ '--seat-row-columns': perRow } as CSSProperties} aria-hidden>
      {Array.from({ length: places }, (_, index) => (
        <li key={index} className={styles.seat} data-state={index === 0 ? 'first' : index < seats ? 'open' : 'unused'}>
          {index === 0 ? first : index + 1}
        </li>
      ))}
    </ol>
  );
}
