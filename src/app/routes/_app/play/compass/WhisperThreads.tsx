import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

import { useMotionAllowed } from '@app/styles/motion';

import type { CompassPlayer, Whisper } from './compassTable';
import styles from './WhisperThreads.module.css';

/*
 * In a game that announces private messages, a thread draws itself from the writer's token in the bottom bar to the reader's
 * (playtest feedback, 2026-11-25; Norbert picked the thread look, in the writer's faction colour, in front of the table and behind the bar).
 * What was written stays private: the thread only shows that a message went, and to whom.
 */

type Point = Readonly<{ x: number; y: number }>;
type Thread = Readonly<{ key: number; from: Point; to: Point; color: string | undefined; toSeat: string }>;

/* How many threads can show at once; a burst beyond that drops the oldest. */
const SHOWN = 6;

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
 * Draws each whisper notice the table hears as a thread from the writer's token to the reader's, inside the bar `bar` and behind it.
 * A notice whose tokens are not both in the bar, as during a recall, draws nothing.
 */
export function WhisperThreads({
  bar,
  players,
  subscribe,
}: Readonly<{
  bar: RefObject<HTMLDivElement | null>;
  players: readonly CompassPlayer[];
  subscribe: ((listener: (whisper: Whisper) => void) => () => void) | undefined;
}>) {
  const [threads, setThreads] = useState<readonly Thread[]>([]);
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
      const color = playersNow.current.find((player) => player.seat === whisper.from)?.color;
      setThreads((all) => [...all, { key: whisper.key, from, to, color, toSeat: whisper.to }].slice(-SHOWN));
    });
  }, [subscribe, bar]);
  const done = (key: number) => setThreads((all) => all.filter((thread) => thread.key !== key));
  return (
    <svg className={styles.layer} aria-hidden data-whisper-threads>
      {threads.map((thread) => (
        <WhisperThread key={thread.key} thread={thread} bar={bar} onDone={() => done(thread.key)} />
      ))}
    </svg>
  );
}

/* How high the arc rises above the tokens: a little for neighbours, more across the bar. */
function arcHeight(from: Point, to: Point) {
  return Math.min(70, 26 + Math.abs(to.x - from.x) * 0.18);
}

/* The thread takes longer to draw the further it goes, so a long one is not a blur and a short one does not dawdle. */
function drawMs(from: Point, to: Point) {
  return Math.min(1100, 500 + Math.hypot(to.x - from.x, to.y - from.y) * 0.9);
}

/* The reader's token pops as the thread reaches it: a quick swell with a little overshoot, then back. */
function pop(bar: HTMLElement | null, seat: string) {
  const token = bar?.querySelector<HTMLElement>(`[data-whisper-seat="${CSS.escape(seat)}"]`);
  token?.animate(
    [
      { scale: 1, offset: 0 },
      { scale: 1.35, offset: 0.35 },
      { scale: 0.95, offset: 0.7 },
      { scale: 1, offset: 1 },
    ],
    { duration: 360, easing: 'ease-out' }
  );
}

/*
 * One thread: it draws itself from the writer's token to the reader's, holds a moment and fades; with motion reduced it shows whole and fades.
 * It starts once, as it mounts, so a render meanwhile neither restarts nor cancels it.
 */
function WhisperThread({
  thread,
  bar,
  onDone,
}: Readonly<{ thread: Thread; bar: RefObject<HTMLDivElement | null>; onDone: () => void }>) {
  const path = useRef<SVGPathElement>(null);
  const motion = useMotionAllowed();
  const latest = useRef({ motion, onDone });
  useEffect(() => {
    latest.current = { motion, onDone };
  });
  const { from, to, toSeat } = thread;
  const control = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - arcHeight(from, to) * 2 };
  const d = `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  const duration = drawMs(from, to);
  useLayoutEffect(() => {
    const line = path.current!;
    const length = line.getTotalLength();
    line.style.strokeDasharray = `${length}`;
    const moving = latest.current.motion;
    let cancelled = false;
    let running: Animation[] = [];
    const play = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
      const animation = line.animate(frames, { fill: 'forwards', ...options });
      running = [...running, animation];
      return animation.finished;
    };
    /* The reader's token pops the moment the thread reaches it; then the thread holds a beat and fades. */
    const run = async () => {
      if (moving) {
        await play(
          [
            { strokeDashoffset: length, opacity: 1 },
            { strokeDashoffset: 0, opacity: 1 },
          ],
          { duration, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' }
        );
        if (cancelled) {
          return;
        }
        pop(bar.current, toSeat);
        await play([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 250, easing: 'ease-in' });
      } else {
        await play(
          [
            { strokeDashoffset: 0, opacity: 0 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.2 },
            { strokeDashoffset: 0, opacity: 1, offset: 0.75 },
            { strokeDashoffset: 0, opacity: 0 },
          ],
          { duration: 1400 }
        );
      }
      if (!cancelled) {
        latest.current.onDone();
      }
    };
    run().catch(() => {
      /* Cancelled as the thread unmounts. */
    });
    return () => {
      cancelled = true;
      running.forEach((animation) => animation.cancel());
    };
  }, [bar, toSeat, duration]);
  return (
    <path
      ref={path}
      d={d}
      className={styles.thread}
      style={{ opacity: 0, ...(thread.color ? { stroke: thread.color } : {}) }}
      data-whisper-thread
    />
  );
}
