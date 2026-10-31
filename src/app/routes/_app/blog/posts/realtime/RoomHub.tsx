import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { useReducedMotion } from './motion';
import { SEATS } from './palette';
import type { SeatId } from './palette';
import styles from './RoomHub.module.css';
import { useSeen } from './useSeen';

/*
 * The figure for where a game lives: one room in the middle, with its own database, and the browsers at the table around it.
 * In a loop, one browser sends a change up to the room, the room saves it and sends the update out to all four, the spectator included.
 * The site's database sits off to the side on a faint line, because it only says who may come in and never sees a move.
 */

const WIDTH = 480;
const HEIGHT = 340;
const ROOM = { x: 165, y: 108, width: 150, height: 112 };
const CENTRE = { x: ROOM.x + ROOM.width / 2, y: ROOM.y + ROOM.height / 2 };
const BROWSER = { width: 112, height: 70 };

type Browser = { seat: SeatId; x: number; y: number };

/** The four screens at the table, each by its top-left corner. */
const BROWSERS: readonly Browser[] = [
  { seat: 'atreides', x: 16, y: 18 },
  { seat: 'harkonnen', x: 352, y: 18 },
  { seat: 'fremen', x: 16, y: 230 },
  { seat: 'spectator', x: 352, y: 230 },
];

/** Only players send changes; the spectator only receives. */
const SENDERS = BROWSERS.filter((browser) => browser.seat !== 'spectator');

/** One round of the loop, in milliseconds; the stylesheet's `--cycle` matches it. */
const CYCLE_MS = 4200;

function centre(browser: Browser) {
  return { x: browser.x + BROWSER.width / 2, y: browser.y + BROWSER.height / 2 };
}

function Database({ x, y }: { x: number; y: number }) {
  return (
    <g className={styles.database} transform={`translate(${x} ${y})`}>
      <path d="M -18 -14 V 14 A 18 6 0 0 0 18 14 V -14" />
      <ellipse cx="0" cy="-14" rx="18" ry="6" />
      <path d="M -18 -4 A 18 6 0 0 0 18 -4 M -18 5 A 18 6 0 0 0 18 5" className={styles.thin} />
      <text x="0" y="34" className={styles.tiny}>
        SQLite
      </text>
    </g>
  );
}

function Screen({ browser }: { browser: Browser }) {
  const { name, color } = SEATS[browser.seat];
  const player = browser.seat !== 'spectator';
  return (
    <g
      className={styles.screen}
      transform={`translate(${browser.x} ${browser.y})`}
      style={{ '--seat': color } as CSSProperties}
    >
      <rect width={BROWSER.width} height={BROWSER.height} rx="6" className={styles.frame} />
      <rect width={BROWSER.width} height="14" rx="6" className={styles.bar} />
      <rect y="8" width={BROWSER.width} height="6" className={styles.bar} />
      <circle cx="8" cy="7" r="2.2" className={styles.dot} />
      <circle cx="15" cy="7" r="2.2" className={styles.dot} />
      <circle cx="22" cy="7" r="2.2" className={styles.dot} />
      {/* A tiny table on each screen, seen from the seat's own side. */}
      <circle cx={BROWSER.width / 2} cy="47" r="13" className={styles.table} />
      <circle cx={BROWSER.width / 2} cy="47" r="3.5" className={styles.seatDot} />
      <text x={BROWSER.width / 2} y="29" className={styles.label}>
        {name}
      </text>
      <text x={BROWSER.width / 2} y="66" className={styles.tiny}>
        {player ? 'player' : 'watching'}
      </text>
    </g>
  );
}

export function RoomHub() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { armed, seen } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const playing = armed && seen && !reduced;
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!playing) {
      return;
    }
    const timer = setInterval(() => setRound((count) => count + 1), CYCLE_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const sender = SENDERS[round % SENDERS.length]!;
  const from = centre(sender);

  return (
    <div
      ref={rootRef}
      className={styles.root}
      role="img"
      aria-label="One room per game, with four browsers connected to it"
    >
      <svg
        className={styles.scene}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ '--cycle': `${CYCLE_MS}ms` } as CSSProperties}
      >
        {/* Every browser's connection, drawn before the boxes so they cover the ends. */}
        {BROWSERS.map((browser) => {
          const point = centre(browser);
          return (
            <line
              key={browser.seat}
              x1={point.x}
              y1={point.y}
              x2={CENTRE.x}
              y2={CENTRE.y}
              className={clsx(styles.link, playing && browser.seat === sender.seat && styles.activeLink)}
            />
          );
        })}

        {/* The site's database, off the hot path. */}
        <line x1={CENTRE.x} y1={ROOM.y + ROOM.height} x2={CENTRE.x} y2={HEIGHT - 40} className={styles.faint} />
        <g transform={`translate(${CENTRE.x} ${HEIGHT - 40})`} className={styles.convex}>
          <rect x="-54" y="0" width="108" height="34" rx="4" />
          <text x="0" y="14" className={styles.label}>
            Convex
          </text>
          <text x="0" y="27" className={styles.tiny}>
            who may enter
          </text>
        </g>

        {/* The room. */}
        <g className={styles.room}>
          <rect x={ROOM.x} y={ROOM.y} width={ROOM.width} height={ROOM.height} rx="8" />
          <text x={CENTRE.x} y={ROOM.y + 22} className={styles.title}>
            Room
          </text>
          <text x={CENTRE.x} y={ROOM.y + 36} className={styles.tiny}>
            one per game
          </text>
          <Database x={CENTRE.x} y={ROOM.y + 72} />
        </g>

        {BROWSERS.map((browser) => (
          <Screen key={browser.seat} browser={browser} />
        ))}

        {/* The pulses of one round; the key restarts their animations each round. */}
        {playing ? (
          <g key={round}>
            <circle
              r="5"
              className={styles.up}
              style={
                {
                  '--x0': from.x,
                  '--y0': from.y,
                  '--x1': CENTRE.x,
                  '--y1': CENTRE.y,
                  '--seat': SEATS[sender.seat].color,
                } as CSSProperties
              }
            />
            <circle cx={CENTRE.x} cy={ROOM.y + 72} r="22" className={styles.saveRing} />
            {BROWSERS.map((browser) => {
              const to = centre(browser);
              return (
                <g key={browser.seat}>
                  <circle
                    r="4"
                    className={styles.out}
                    style={{ '--x0': CENTRE.x, '--y0': CENTRE.y, '--x1': to.x, '--y1': to.y } as CSSProperties}
                  />
                  {/* The screen lights for a moment as the update lands. */}
                  <rect
                    x={browser.x}
                    y={browser.y}
                    width={BROWSER.width}
                    height={BROWSER.height}
                    rx="6"
                    className={styles.flash}
                    style={{ '--seat': SEATS[browser.seat].color } as CSSProperties}
                  />
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>
      <ol className={clsx(styles.legend, playing && styles.legendPlaying)} key={playing ? round : 'still'}>
        <li className={styles.step}>
          <span className={styles.number}>1</span> a move goes in
        </li>
        <li className={styles.step}>
          <span className={styles.number}>2</span> the room saves it
        </li>
        <li className={styles.step}>
          <span className={styles.number}>3</span> every screen gets the update
        </li>
      </ol>
    </div>
  );
}
