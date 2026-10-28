import styles from './BoardSeats.module.css';

const RING_RADIUS = 118;

/**
 * A board seen from above with its seats round the rim, at the angles a table lays them out, the first seat nearest the viewer.
 * Each angle is in radians, counter-clockwise from the right, as the table measures them;
 * seat one is marked as the viewer's.
 * A change in the seats slides each one round the rim to its new place.
 */
export function BoardSeats({
  angles,
  board,
  label,
  first = 'You',
}: Readonly<{
  angles: readonly number[];
  /** The board's picture, drawn inside the rim. */
  board: string;
  label: string;
  /** What the first seat says in place of its number. */
  first?: string;
}>) {
  return (
    <svg className={styles.ring} viewBox="-140 -140 280 280" role="img" aria-label={label}>
      <circle className={styles.ground} r="132" />
      <image href={board} x="-100" y="-100" width="200" height="200" />
      {angles.map((angle, index) => {
        /* The page's y axis runs down, so the table's counter-clockwise angle turns the other way here. */
        const degrees = (-angle * 180) / Math.PI;
        return (
          <g
            key={index}
            className={styles.station}
            data-first={index === 0 ? '' : undefined}
            style={{ transform: `rotate(${degrees}deg) translateX(${RING_RADIUS}px) rotate(${-degrees}deg)` }}
          >
            <circle r={index === 0 ? 12 : 9} />
            <text textAnchor="middle" dy="3.5">
              {index === 0 ? first : index + 1}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
