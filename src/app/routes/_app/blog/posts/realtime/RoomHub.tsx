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
/** When in a round each legend step lights, as a share of the cycle, and -1 for the quiet tail. */
const PHASES: [number, number][] = [
  [0, 0],
  [0.22, 1],
  [0.4, 2],
  [0.8, -1],
];

function centre(browser: Browser) {
  return {
    x: browser.x + BROWSER.width / 2,
    y: browser.y + BROWSER.height / 2,
  };
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

/** Counts the rounds while the figure is in view; a round already running finishes on its own, and a reader who comes back gets a fresh one at once. */
function useRounds(playing: boolean, active: boolean) {
  const [round, setRound] = useState(0);
  const paused = useRef(false);
  useEffect(() => {
    if (!playing || !active) {
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setRound((count) => count + 1);
      timer = setTimeout(tick, CYCLE_MS);
    };
    timer = setTimeout(tick, paused.current ? 0 : CYCLE_MS);
    return () => {
      clearTimeout(timer);
      paused.current = true;
    };
  }, [playing, active]);
  return round;
}

/** Which legend step is lit, set from timers rather than a CSS animation, since an animated colour or opacity on text made the page lay out each frame. */
function usePhase(playing: boolean, round: number) {
  const [phase, setPhase] = useState(-1);
  useEffect(() => {
    if (!playing) {
      return;
    }
    const timers = PHASES.map(([at, next]) => setTimeout(() => setPhase(next), at * CYCLE_MS));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [playing, round]);
  return phase;
}

/** The room, the site's database and every browser's connection, with the sender's line lit. */
function Scene({ sender }: { sender: Browser | null }) {
  return (
    <svg className={styles.scene} viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
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
            className={clsx(styles.link, browser.seat === sender?.seat && styles.activeLink)}
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
    </svg>
  );
}

/** The pulses of one round, as plain elements over the drawing so their motion is a composited translate and never a layout of the SVG. */
function Pulses({ sender }: { sender: Browser }) {
  const from = centre(sender);
  return (
    <div className={styles.pulses} aria-hidden="true">
      <span
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
      <span className={styles.saveRing} style={{ '--x0': CENTRE.x, '--y0': ROOM.y + 72 } as CSSProperties} />
      {BROWSERS.map((browser) => {
        const to = centre(browser);
        return (
          <span key={browser.seat} className={styles.contents}>
            <span
              className={styles.out}
              style={
                {
                  '--x0': CENTRE.x,
                  '--y0': CENTRE.y,
                  '--x1': to.x,
                  '--y1': to.y,
                } as CSSProperties
              }
            />
            {/* The screen lights for a moment as the update lands. */}
            <span
              className={styles.flash}
              style={
                {
                  '--x0': browser.x,
                  '--y0': browser.y,
                  '--seat': SEATS[browser.seat].color,
                } as CSSProperties
              }
            />
          </span>
        );
      })}
    </div>
  );
}

const LEGEND = ['a move goes in', 'the room saves it', 'every screen gets the update'];

export function RoomHub() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { armed, seen, active } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const playing = armed && seen && !reduced;
  const round = useRounds(playing, active);
  const phase = usePhase(playing, round);
  const sender = SENDERS[round % SENDERS.length]!;

  return (
    <div ref={rootRef} className={styles.root}>
      <div
        className={styles.stage}
        style={
          {
            '--cycle': `${CYCLE_MS}ms`,
            aspectRatio: `${WIDTH} / ${HEIGHT}`,
          } as CSSProperties
        }
        role="img"
        aria-label="One room per game, with four browsers connected to it"
      >
        <Scene sender={playing ? sender : null} />
        {/* The key restarts the pulses each round. */}
        {playing ? <Pulses key={round} sender={sender} /> : null}
      </div>
      <ol className={clsx(styles.legend, playing && styles.legendPlaying)}>
        {LEGEND.map((text, index) => (
          <li key={text} className={clsx(styles.step, playing && phase === index && styles.lit)}>
            <span className={styles.number}>{index + 1}</span> {text}
          </li>
        ))}
      </ol>
    </div>
  );
}
