import { Mail, MessageCircle } from 'lucide-react';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { CompassPlayer, Whisper } from './compassTable';
import { PlayerToken } from './PlayerToken';
import styles from './WhisperFlights.module.css';

/*
 * In a game that announces private messages, a small bubble flies along the bottom bar from the writer's token to the reader's
 * (playtest feedback, 2026-11-25). What it says stays private: the bubble only shows that a message went, and to whom.
 * Prototype: each look is offered to Norbert as its own story; the one he picks stays and the rest go.
 */

/** How the whisper travels: a speech bubble, a spark with a tail, a typing pill, an envelope, a thread drawn between the tokens, or the writer's own token. */
export type WhisperLook = 'bubble' | 'spark' | 'typing' | 'envelope' | 'thread' | 'token';
export const WHISPER_LOOKS: readonly WhisperLook[] = ['bubble', 'spark', 'typing', 'envelope', 'thread', 'token'];

/** The look the bar uses; a story sets another to compare them. */
export const WhisperLookContext = createContext<WhisperLook>('bubble');

type Point = Readonly<{ x: number; y: number }>;
type Flight = Readonly<{ key: number; from: Point; to: Point; writer: CompassPlayer | undefined; toSeat: string }>;

/* How many whispers can be in the air at once; a burst beyond that drops the oldest. */
const IN_FLIGHT = 6;

/* The centre of a seat's token in the bar, relative to the bar. */
function tokenCentre(bar: HTMLElement, seat: string): Point | null {
  const token = bar.querySelector<HTMLElement>(`[data-whisper-seat="${CSS.escape(seat)}"]`);
  if (!token) {
    return null;
  }
  const outer = bar.getBoundingClientRect();
  const rect = token.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - outer.left, y: rect.top + rect.height / 2 - outer.top };
}

/**
 * Flies each whisper notice the table hears from the writer's token to the reader's, inside the bar `bar`.
 * A notice whose tokens are not both in the bar, as during a recall, flies nowhere.
 */
export function WhisperFlights({
  bar,
  players,
  subscribe,
}: Readonly<{
  bar: RefObject<HTMLDivElement | null>;
  players: readonly CompassPlayer[];
  subscribe: ((listener: (whisper: Whisper) => void) => () => void) | undefined;
}>) {
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const playersNow = useRef(players);
  useEffect(() => {
    playersNow.current = players;
  });
  useEffect(() => {
    if (!subscribe) {
      return;
    }
    return subscribe((whisper) => {
      const element = bar.current;
      const from = element && tokenCentre(element, whisper.from);
      const to = element && tokenCentre(element, whisper.to);
      if (!from || !to) {
        return;
      }
      const writer = playersNow.current.find((player) => player.seat === whisper.from);
      setFlights((all) => [...all, { key: whisper.key, from, to, writer, toSeat: whisper.to }].slice(-IN_FLIGHT));
    });
  }, [subscribe, bar]);
  const land = (key: number) => setFlights((all) => all.filter((flight) => flight.key !== key));
  return (
    <div className={styles.layer} aria-hidden data-whisper-flights>
      {flights.map((flight) => (
        <WhisperFlight key={flight.key} flight={flight} bar={bar} onLanded={() => land(flight.key)} />
      ))}
    </div>
  );
}

/* How high the arc rises above the tokens: a little for neighbours, more across the bar, never off the top of the table's edge. */
function arcHeight(from: Point, to: Point) {
  return Math.min(70, 26 + Math.abs(to.x - from.x) * 0.18);
}

/* A point on the arc at `t` (0 to 1): a quadratic curve whose control point stands above the midpoint. */
function onArc(from: Point, to: Point, t: number): Point {
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arcHeight(from, to) * 2 };
  const u = 1 - t;
  return {
    x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
    y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
  };
}

/* The flight's time grows with its distance, so a long hop is not a blur and a short one does not dawdle. */
function flightMs(from: Point, to: Point) {
  return Math.min(1500, 700 + Math.hypot(to.x - from.x, to.y - from.y) * 1.2);
}

const STEPS = 24;

/* Keyframes that carry an element along the arc, fading in as it leaves and out as it lands. */
function arcKeyframes(from: Point, to: Point, lift = 0): Keyframe[] {
  return Array.from({ length: STEPS + 1 }, (_, index) => {
    const t = index / STEPS;
    const point = onArc(from, to, t);
    const opacity = t < 0.12 ? t / 0.12 : t > 0.85 ? (1 - t) / 0.15 : 1;
    const scale = 0.6 + Math.sin(Math.PI * t) * 0.5;
    return {
      offset: t,
      opacity,
      transform: `translate(${point.x}px, ${point.y - lift}px) translate(-50%, -50%) scale(${scale})`,
    };
  });
}

/* With motion reduced the whisper does not travel: it shows a moment above the reader's token and fades. */
function stillKeyframes(to: Point, lift = 22): Keyframe[] {
  const transform = `translate(${to.x}px, ${to.y - lift}px) translate(-50%, -50%)`;
  return [
    { offset: 0, opacity: 0, transform },
    { offset: 0.2, opacity: 1, transform },
    { offset: 0.75, opacity: 1, transform },
    { offset: 1, opacity: 0, transform },
  ];
}

/* The reader's token gives a small nod as the whisper lands. */
function nod(bar: HTMLElement | null, seat: string) {
  const token = bar?.querySelector<HTMLElement>(`[data-whisper-seat="${CSS.escape(seat)}"]`);
  token?.animate([{ scale: 1 }, { scale: 1.18 }, { scale: 1 }], { duration: 280, easing: 'ease-out' });
}

function WhisperFlight({
  flight,
  bar,
  onLanded,
}: Readonly<{ flight: Flight; bar: RefObject<HTMLDivElement | null>; onLanded: () => void }>) {
  const look = useContext(WhisperLookContext);
  const motion = useMotionAllowed();
  if (look === 'thread') {
    return <ThreadFlight flight={flight} motion={motion} bar={bar} onLanded={onLanded} />;
  }
  return <TravellingFlight flight={flight} look={look} motion={motion} bar={bar} onLanded={onLanded} />;
}

/*
 * Starts the flight's animations once, as it mounts, and runs `onLanded` when they have all finished; with motion the reader's token nods then.
 * What it runs is read when it mounts, so a render meanwhile neither restarts nor cancels the flight.
 */
function useLanding(
  run: () => Animation[],
  {
    flight,
    motion,
    bar,
    onLanded,
  }: Readonly<{ flight: Flight; motion: boolean; bar: RefObject<HTMLDivElement | null>; onLanded: () => void }>
) {
  const latest = useRef({ run, motion, onLanded });
  useEffect(() => {
    latest.current = { run, motion, onLanded };
  });
  const seat = flight.toSeat;
  useLayoutEffect(() => {
    const animations = latest.current.run();
    let cancelled = false;
    Promise.all(animations.map((animation) => animation.finished))
      .then(() => {
        if (cancelled) {
          return;
        }
        if (latest.current.motion) {
          nod(bar.current, seat);
        }
        latest.current.onLanded();
      })
      .catch(() => {
        /* Cancelled as the flight unmounts. */
      });
    return () => {
      cancelled = true;
      animations.forEach((animation) => animation.cancel());
    };
  }, [bar, seat]);
}

function TravellingFlight({
  flight,
  look,
  motion,
  bar,
  onLanded,
}: Readonly<{
  flight: Flight;
  look: Exclude<WhisperLook, 'thread'>;
  motion: boolean;
  bar: RefObject<HTMLDivElement | null>;
  onLanded: () => void;
}>) {
  const head = useRef<HTMLDivElement>(null);
  const tail = useRef<(HTMLDivElement | null)[]>([]);
  const duration = flightMs(flight.from, flight.to);
  useLanding(
    () => {
      const frames = motion ? arcKeyframes(flight.from, flight.to) : stillKeyframes(flight.to);
      const options: KeyframeAnimationOptions = {
        duration: motion ? duration : 1400,
        easing: motion ? 'cubic-bezier(0.45, 0, 0.3, 1)' : 'linear',
        fill: 'forwards',
      };
      const animations = [head.current!.animate(frames, options)];
      if (motion && look === 'spark') {
        tail.current.forEach((element, index) => {
          if (element) {
            animations.push(element.animate(frames, { ...options, delay: (index + 1) * 45 }));
          }
        });
      }
      return animations;
    },
    { flight, motion, bar, onLanded }
  );
  return (
    <>
      {look === 'spark' &&
        motion &&
        [0.55, 0.35, 0.2].map((fade, index) => (
          <div
            key={fade}
            ref={(element) => {
              tail.current[index] = element;
            }}
            className={styles.flyer}
            style={{ opacity: 0 }}
          >
            <span className={styles.spark} style={{ opacity: fade, scale: String(1 - (index + 1) * 0.18) }} />
          </div>
        ))}
      <div ref={head} className={styles.flyer} style={{ opacity: 0 }} data-whisper-flight={look}>
        <FlyerFace look={look} writer={flight.writer} />
      </div>
    </>
  );
}

function FlyerFace({ look, writer }: Readonly<{ look: Exclude<WhisperLook, 'thread'>; writer?: CompassPlayer }>) {
  switch (look) {
    case 'bubble':
      return (
        <span className={styles.bubble}>
          <MessageCircle size={20} strokeWidth={1.75} />
        </span>
      );
    case 'spark':
      return <span className={styles.spark} />;
    case 'typing':
      return (
        <span className={styles.typing}>
          <i />
          <i />
          <i />
        </span>
      );
    case 'envelope':
      return (
        <span className={styles.envelope}>
          <Mail size={15} strokeWidth={2} />
        </span>
      );
    case 'token':
      return writer ? (
        <span className={styles.token}>
          <PlayerToken player={writer} size={20} />
        </span>
      ) : (
        <span className={styles.spark} />
      );
  }
}

/* A thin thread draws itself from the writer's token to the reader's, holds a moment and fades; with motion reduced it shows and fades. */
function ThreadFlight({
  flight,
  motion,
  bar,
  onLanded,
}: Readonly<{ flight: Flight; motion: boolean; bar: RefObject<HTMLDivElement | null>; onLanded: () => void }>) {
  const path = useRef<SVGPathElement>(null);
  const { from, to } = flight;
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arcHeight(from, to) * 2 };
  const d = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  useLanding(
    () => {
      const line = path.current!;
      const length = line.getTotalLength();
      line.style.strokeDasharray = `${length}`;
      const draw = motion
        ? [
            { strokeDashoffset: length, opacity: 1 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.55 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.75 },
            { strokeDashoffset: 0, opacity: 0 },
          ]
        : [
            { strokeDashoffset: 0, opacity: 0 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.2 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.75 },
            { strokeDashoffset: 0, opacity: 0 },
          ];
      return [
        line.animate(draw, {
          duration: motion ? flightMs(from, to) + 500 : 1400,
          easing: 'ease-in-out',
          fill: 'forwards',
        }),
      ];
    },
    { flight, motion, bar, onLanded }
  );
  return (
    <svg className={styles.thread} aria-hidden>
      <path ref={path} d={d} className={styles.threadLine} style={{ opacity: 0 }} />
    </svg>
  );
}
