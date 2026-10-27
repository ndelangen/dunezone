import { Tooltip } from '@mantine/core';
import clsx from 'clsx';
import { Crown } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import styles from './SeatedTable.module.css';

/** One taken seat round a {@link SeatedTable}: the player's face, ringed in their colour, with an optional badge and crown. */
export type TableSeat = Readonly<{
  /** What the seat says to a screen reader and in its tooltip. */
  label: string;
  /** The disc behind the player's initial. */
  fill: string;
  /** The ring round the face, such as the faction's colour; none rings it in paper. */
  edge: string | null;
  /** The player's picture, drawn over the disc. */
  image: string | null;
  /** The letter on the disc when there is no picture. */
  initial: string;
  /** Pinned to the lower right of the face, such as the faction's token. */
  badge: ReactNode;
  /** A crown on the upper right, for a winner. */
  crowned: boolean;
  /** Outlined, for the viewer's own seat. */
  highlighted: boolean;
}>;

/**
 * What the middle of a {@link SeatedTable} says, top to bottom: a small heading, a large number, a word, a glyph and a small footnote.
 * Each is left out when not given, so one table reads "Turn 3 of 10" and another "Drafting, 3 of 6".
 */
export type TableCentre = Readonly<{
  above?: string | undefined;
  number?: number | undefined;
  word?: string | undefined;
  /** An icon in place of words, such as a trophy. */
  glyph?: ReactNode;
  below?: string | undefined;
}>;

/* The turn tracker's sectors default to ten, as a game of Dune runs. */
const TURNS = 10;
const SEAT_RADIUS = 42;
const TABLE_RADIUS = 28;
const ARC_RADIUS = 32;
const ARC_LENGTH = 2 * Math.PI * ARC_RADIUS;

function seatPlacement(index: number, count: number): CSSProperties {
  const angle = (index / count) * 2 * Math.PI - Math.PI / 2;
  const size = Math.min(19, 0.84 * 2 * SEAT_RADIUS * Math.sin(Math.PI / count));
  return {
    '--seat-x': `${50 + SEAT_RADIUS * Math.cos(angle)}%`,
    '--seat-y': `${50 + SEAT_RADIUS * Math.sin(angle)}%`,
    '--seat-size': `${size}cqi`,
  } as CSSProperties;
}

/* A tick round the table for each turn, and an arc for how much of the game has been played. */
function TableArt({ progress, turns }: Readonly<{ progress: number | null; turns: number }>) {
  return (
    <svg className={styles.tableArt} viewBox="0 0 100 100" aria-hidden>
      <circle className={styles.tableTop} cx="50" cy="50" r={TABLE_RADIUS} />
      <circle className={styles.tableInlay} cx="50" cy="50" r={TABLE_RADIUS - 3.5} />
      {progress === null ? null : (
        <>
          {Array.from({ length: turns }, (_, turn) => {
            const angle = (turn / turns) * 2 * Math.PI - Math.PI / 2;
            const inner = ARC_RADIUS - 1.4;
            const outer = ARC_RADIUS + 1.4;
            return (
              <line
                key={turn}
                className={styles.tick}
                x1={50 + inner * Math.cos(angle)}
                y1={50 + inner * Math.sin(angle)}
                x2={50 + outer * Math.cos(angle)}
                y2={50 + outer * Math.sin(angle)}
              />
            );
          })}
          <circle className={styles.arcTrack} cx="50" cy="50" r={ARC_RADIUS} />
          <circle
            className={styles.arc}
            cx="50"
            cy="50"
            r={ARC_RADIUS}
            strokeDasharray={`${ARC_LENGTH * Math.min(1, Math.max(0, progress))} ${ARC_LENGTH}`}
            transform="rotate(-90 50 50)"
          />
        </>
      )}
    </svg>
  );
}

function TakenSeat({ seat, style }: Readonly<{ seat: TableSeat; style: CSSProperties }>) {
  return (
    <Tooltip label={seat.label} withArrow>
      <span
        role="img"
        aria-label={seat.label}
        className={clsx(styles.seat, styles.seatTaken, seat.highlighted && styles.seatViewer)}
        style={
          { ...style, '--seat-fill': seat.fill, '--seat-edge': seat.edge ?? 'var(--color-paper)' } as CSSProperties
        }
      >
        {seat.image ? (
          <img className={styles.avatar} src={seat.image} alt="" />
        ) : (
          <span className={styles.initial}>{seat.initial}</span>
        )}
        {seat.badge ? <span className={styles.badge}>{seat.badge}</span> : null}
        {seat.crowned ? (
          <span className={styles.crown}>
            <Crown aria-hidden />
          </span>
        ) : null}
      </span>
    </Tooltip>
  );
}

/**
 * A round table seen from above, its seats drawn round the rim (direction C of #1739): a glance tells who sits where, which seats are open and, from the arc of turn ticks, how far the game has come.
 * A null seat is open.
 * The centre says where the game is.
 */
export function SeatedTable({
  label,
  seats,
  progress,
  turns = TURNS,
  centre,
}: Readonly<{
  label: string;
  seats: readonly (TableSeat | null)[];
  /** How much of the game has been played, from 0 to 1; null draws no tracker. */
  progress: number | null;
  turns?: number;
  centre: TableCentre;
}>) {
  return (
    <div className={styles.ring} role="group" aria-label={label}>
      <TableArt progress={progress} turns={turns} />
      <div className={styles.centre}>
        <Centre {...centre} />
      </div>
      {seats.map((seat, index) => {
        const placement = seatPlacement(index, seats.length);
        return seat ? (
          <TakenSeat key={index} seat={seat} style={placement} />
        ) : (
          <span
            key={index}
            role="img"
            aria-label="Open seat"
            className={clsx(styles.seat, styles.seatOpen)}
            style={placement}
          />
        );
      })}
    </div>
  );
}

/* The middle of the table, from its words and number. */
function Centre({ above, number, word, glyph, below }: TableCentre) {
  return (
    <>
      {above ? <span className={styles.centreSmall}>{above}</span> : null}
      {number === undefined ? null : <span className={styles.centreNumber}>{number}</span>}
      {word ? <span className={styles.centreWord}>{word}</span> : null}
      {glyph ? <span className={styles.centreGlyph}>{glyph}</span> : null}
      {below ? <span className={styles.centreSmall}>{below}</span> : null}
    </>
  );
}
