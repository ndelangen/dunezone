import clsx from 'clsx';
import type { CSSProperties } from 'react';

import styles from './Hand.module.css';
import { GROUND, HAND_PATH, SEATS } from './palette';
import type { SeatId } from './palette';

/*
 * A player's hand as the table shows it: the pointer hand in the seat's colour, the avatar circle under it and the name.
 * The hand's tip is the element's origin, so a figure places it with `translate` like any pointer.
 * The figures that draw their whole scene in one SVG use `HandGlyph` for the hand alone.
 */

export function HandGlyph({ color, scale = 1 }: { color: string; scale?: number }) {
  return (
    <g transform={`scale(${scale})`}>
      <path d={HAND_PATH} fill={color} stroke={GROUND} strokeWidth="1.4" strokeLinejoin="round" />
    </g>
  );
}

export function Hand({
  seat,
  label,
  className,
  style,
  small = false,
  bare = false,
}: {
  seat: SeatId;
  /** The name under the hand; the seat's name when left out. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  small?: boolean;
  /** Only the hand glyph, for a hand drawn over a piece where the badge would cover it. */
  bare?: boolean;
}) {
  const { color, name, initial } = SEATS[seat];
  return (
    <span
      className={clsx(styles.hand, small && styles.small, className)}
      style={{ ...style, '--seat': color } as CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 26 32" className={styles.glyph}>
        <HandGlyph color={color} />
      </svg>
      {bare ? null : (
        <span className={styles.badge}>
          <span className={styles.avatar}>{initial}</span>
          <span className={styles.name}>{label ?? name}</span>
        </span>
      )}
    </span>
  );
}
