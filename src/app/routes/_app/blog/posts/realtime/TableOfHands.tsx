import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';

import { HandGlyph } from './Hand';
import { GROUND, SEATS } from './palette';
import type { SeatId } from './palette';
import styles from './TableOfHands.module.css';

/*
 * The post's closing picture: the round board from above, with four hands drifting over it and one of them carrying a troop.
 * It is a stylised board, not the table's own: sand, the storm's eighteen sectors, a few territories and the sink in the middle, enough to say Dune.
 * The hands wander in slow loops that never quite repeat together; under reduced motion they rest where their loops begin.
 */

const WIDTH = 640;
const HEIGHT = 360;
const CENTRE = { x: 320, y: 180 };
const RADIUS = 158;

const TERRITORY_CLASS = { rock: styles.rock, sand: styles.sand, stronghold: styles.stronghold } as const;

const SECTORS = Array.from({ length: 18 }, (_, index) => (index * 360) / 18);

/** A handful of territories as soft blobs: rock in the north, sand to the south, and the polar sink in the middle. */
const TERRITORIES: readonly { d: string; kind: 'rock' | 'sand' | 'stronghold' }[] = [
  { d: 'M 250 70 C 290 50, 350 55, 380 80 C 400 100, 370 118, 340 112 C 300 105, 250 110, 250 70 Z', kind: 'rock' },
  {
    d: 'M 190 150 C 180 120, 220 110, 240 130 C 255 150, 235 185, 210 190 C 185 195, 195 170, 190 150 Z',
    kind: 'rock',
  },
  {
    d: 'M 400 180 C 430 160, 470 190, 455 225 C 440 255, 395 250, 390 220 C 386 200, 395 190, 400 180 Z',
    kind: 'sand',
  },
  {
    d: 'M 260 250 C 280 235, 330 240, 350 265 C 365 290, 320 310, 280 300 C 250 292, 245 265, 260 250 Z',
    kind: 'sand',
  },
  { d: 'M 360 125 l 22 -8 l 14 18 l -10 18 l -24 -4 Z', kind: 'stronghold' },
  { d: 'M 226 212 l 20 -12 l 18 12 l -6 22 l -26 -2 Z', kind: 'stronghold' },
];

function SeatHand({
  seat,
  className,
  label,
  children,
}: {
  seat: SeatId;
  className: string;
  label?: string;
  children?: ReactNode;
}) {
  const { color, initial, name } = SEATS[seat];
  const text = label ?? name;
  return (
    <g className={className} style={{ '--seat': color } as CSSProperties}>
      {children}
      <g className={styles.sway}>
        <g transform="translate(-6 -2)">
          <HandGlyph color={color} scale={1.25} />
        </g>
        <g transform="translate(6 40)">
          <circle r="8" fill={GROUND} stroke={color} strokeWidth="2" />
          <text y="3.5" className={styles.initial}>
            {initial}
          </text>
          <rect x="12" y="-7" width={text.length * 6.2 + 10} height="14" rx="7" className={styles.pill} />
          <text x="17" y="3.5" className={styles.name}>
            {text}
          </text>
        </g>
      </g>
    </g>
  );
}

export function TableOfHands() {
  const id = useId();
  const sandId = `${id}-sand`;
  const feltId = `${id}-felt`;

  return (
    <svg
      className={styles.scene}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label="Four hands drifting over the Dune board, one carrying a troop"
    >
      <defs>
        <radialGradient id={sandId} cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#e2c795" />
          <stop offset="0.7" stopColor="#cfae78" />
          <stop offset="1" stopColor="#b9955c" />
        </radialGradient>
        <radialGradient id={feltId} cx="50%" cy="50%" r="70%">
          <stop offset="0" stopColor="#3a3127" />
          <stop offset="1" stopColor="#171511" />
        </radialGradient>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill={`url(#${feltId})`} />

      {/* The board: a rim, the sand, the storm's sectors and the sink. */}
      <circle cx={CENTRE.x} cy={CENTRE.y} r={RADIUS + 8} className={styles.rim} />
      <circle cx={CENTRE.x} cy={CENTRE.y} r={RADIUS} fill={`url(#${sandId})`} />
      {TERRITORIES.map((territory) => (
        <path key={territory.d} d={territory.d} className={TERRITORY_CLASS[territory.kind]} />
      ))}
      {SECTORS.map((angle) => (
        <line
          key={angle}
          x1={CENTRE.x}
          y1={CENTRE.y - RADIUS}
          x2={CENTRE.x}
          y2={CENTRE.y - 48}
          transform={`rotate(${angle} ${CENTRE.x} ${CENTRE.y})`}
          className={styles.sector}
        />
      ))}
      {/* The storm, one sector wide. */}
      <path
        d={`M ${CENTRE.x} ${CENTRE.y} L ${CENTRE.x} ${CENTRE.y - RADIUS} A ${RADIUS} ${RADIUS} 0 0 1 ${(CENTRE.x + RADIUS * Math.sin(Math.PI / 9)).toFixed(1)} ${(CENTRE.y - RADIUS * Math.cos(Math.PI / 9)).toFixed(1)} Z`}
        className={styles.storm}
      />
      <circle cx={CENTRE.x} cy={CENTRE.y} r="46" className={styles.sink} />
      <circle cx={CENTRE.x} cy={CENTRE.y} r="46" className={styles.sinkRing} />

      {/* A face-down stack beside the board, with the peek everyone can see. */}
      <g transform="translate(98 274)" className={styles.stack}>
        <rect x="4" y="-4" width="40" height="56" rx="4" />
        <rect x="2" y="-2" width="40" height="56" rx="4" />
        <rect width="40" height="56" rx="4" />
        <text x="20" y="30" className={styles.stackWord}>
          TREACHERY
        </text>
        <rect x="-8" y="48" width="56" height="14" rx="7" className={styles.peekPill} />
        <text x="20" y="58" className={styles.peek}>
          peeked
        </text>
      </g>

      {/* A few troops standing on the board. */}
      <g className={styles.troops}>
        <circle cx="372" cy="135" r="7" fill={SEATS.harkonnen.color} />
        <circle cx="384" cy="140" r="7" fill={SEATS.harkonnen.color} />
        <circle cx="244" cy="222" r="7" fill={SEATS.atreides.color} />
        <circle cx="430" cy="215" r="7" fill={SEATS.fremen.color} />
        <circle cx="440" cy="225" r="7" fill={SEATS.fremen.color} />
        <circle cx="300" cy="285" r="7" fill={SEATS.emperor.color} />
      </g>

      <SeatHand seat="atreides" className={styles.driftAtreides}>
        {/* The troop in hand travels just under the fingertips. */}
        <circle cx="2" cy="26" r="8" className={styles.carried} fill={SEATS.atreides.color} />
      </SeatHand>
      <SeatHand seat="harkonnen" className={styles.driftHarkonnen} />
      <SeatHand seat="fremen" className={styles.driftFremen} />
      <SeatHand seat="emperor" className={styles.driftEmperor} />
    </svg>
  );
}
