import { UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

import { Hand } from './Hand';
import styles from './HandRelay.module.css';
import { useReducedMotion } from './motion';
import { useSeen } from './useSeen';

/*
 * The demo for how a hand travels: the reader's pointer over a table on the left, and the same hand as another player receives it on the right.
 * The numbers are the table's own: a position leaves at most every 50 ms, the room gathers 50 ms of motion before it sends, and the receiving browser glides its copy of the hand with `1 - exp(-24 * dt)` of the remaining distance each frame.
 * The wire between the two is pretended here, with 30 to 60 ms each way, so the right side runs 60 to 120 ms behind the left plus the room's batch.
 * Until the reader moves over the table, and whenever they stop for a while, a wander path moves the hand so the demo shows itself.
 */

const SAMPLE_MS = 50;
const BATCH_MS = 50;
const SMOOTHING_RATE = 24;
const DOT_LIFE_MS = 900;
const DOT_POOL = 24;
/** How long after the last pointer movement the wander path takes over again. */
const IDLE_MS = 2500;

type Point = { x: number; y: number };

function latency() {
  return 30 + Math.random() * 30;
}

/** Where the hand wanders on its own: a slow loop that never leaves the table. */
function wander(time: number): Point {
  return {
    x: 0.5 + 0.3 * Math.sin(time / 1900) + 0.06 * Math.sin(time / 530),
    y: 0.5 + 0.28 * Math.sin(time / 1300 + 1.2) + 0.05 * Math.cos(time / 470),
  };
}

/** A stylised round table: sand, a faint ring of sectors and the sink in the middle. */
function TableArt() {
  const sectors = Array.from({ length: 18 }, (_, index) => (index * 360) / 18);
  return (
    <svg className={styles.table} viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="94" className={styles.felt} />
      <circle cx="100" cy="100" r="86" className={styles.sand} />
      {sectors.map((angle) => (
        <line
          key={angle}
          x1="100"
          y1="14"
          x2="100"
          y2="40"
          transform={`rotate(${angle} 100 100)`}
          className={styles.sector}
        />
      ))}
      <circle cx="100" cy="100" r="60" className={styles.ring} />
      <circle cx="100" cy="100" r="26" className={styles.sink} />
    </svg>
  );
}

export function HandRelay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const localHandRef = useRef<HTMLSpanElement>(null);
  const remoteHandRef = useRef<HTMLSpanElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const { armed, seen } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const [smoothing, setSmoothing] = useState(true);

  /* What the frame loop reads without re-rendering: the pointer, the setting and whether to wander. */
  const pointer = useRef<{ point: Point; at: number } | null>(null);
  const settings = useRef({ smoothing: true, wander: true });
  useEffect(() => {
    settings.current = { smoothing, wander: !reduced };
  }, [smoothing, reduced]);

  useEffect(() => {
    const localHand = localHandRef.current;
    const remoteHand = remoteHandRef.current;
    const dotLayer = dotsRef.current;
    if (!armed || !seen || !localHand || !remoteHand || !dotLayer) {
      return;
    }
    const dots = Array.from(dotLayer.children) as HTMLElement[];
    const dotAges: number[] = dots.map(() => Number.NEGATIVE_INFINITY);
    let nextDot = 0;

    let local: Point = { x: 0.5, y: 0.5 };
    let lastSent: Point | null = null;
    let lastSampleAt = 0;
    const inFlight: { point: Point; arrives: number }[] = [];
    let target: Point = local;
    let shown: Point = local;
    let lastFrame = performance.now();

    const place = (element: HTMLElement, point: Point) => {
      element.style.left = `${point.x * 100}%`;
      element.style.top = `${point.y * 100}%`;
    };

    let frame = 0;
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - lastFrame) / 1000);
      lastFrame = now;

      /* The hand under the reader's pointer, or the wander path once they have left it alone for a while. */
      const held = pointer.current;
      if (held && now - held.at < IDLE_MS) {
        local = held.point;
      } else if (settings.current.wander) {
        local = wander(now);
      }
      place(localHand, local);

      /* A position leaves at most every 50 ms, and only when the hand moved; the room's batch sends it on at the next 50 ms boundary. */
      if (now - lastSampleAt >= SAMPLE_MS && (!lastSent || lastSent.x !== local.x || lastSent.y !== local.y)) {
        lastSampleAt = now;
        lastSent = local;
        const atRoom = now + latency();
        const batchSent = Math.ceil(atRoom / BATCH_MS) * BATCH_MS;
        inFlight.push({ point: local, arrives: batchSent + latency() });
      }

      while (inFlight.length > 0 && inFlight[0]!.arrives <= now) {
        target = inFlight.shift()!.point;
        const dot = dots[nextDot]!;
        place(dot, target);
        dotAges[nextDot] = now;
        nextDot = (nextDot + 1) % dots.length;
      }

      if (settings.current.smoothing) {
        const amount = 1 - Math.exp(-SMOOTHING_RATE * dt);
        shown = { x: shown.x + (target.x - shown.x) * amount, y: shown.y + (target.y - shown.y) * amount };
      } else {
        shown = target;
      }
      place(remoteHand, shown);

      for (let index = 0; index < dots.length; index += 1) {
        const age = now - dotAges[index]!;
        dots[index]!.style.opacity = age < DOT_LIFE_MS ? String(1 - age / DOT_LIFE_MS) : '0';
      }

      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [armed, seen]);

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    pointer.current = {
      point: {
        x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
      },
      at: performance.now(),
    };
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.panes}>
        <section className={styles.pane} aria-label="Your screen">
          <h3 className={styles.paneTitle}>
            Your screen <span className={styles.sub}>move over the table</span>
          </h3>
          <div className={clsx(styles.surface, styles.touchable)} onPointerMove={onPointer} onPointerDown={onPointer}>
            <TableArt />
            <span ref={localHandRef} className={styles.hand}>
              <Hand seat="atreides" label="You" />
            </span>
          </div>
        </section>
        <section className={styles.pane} aria-label="What Harkonnen sees">
          <h3 className={styles.paneTitle}>
            What Harkonnen sees <span className={styles.sub}>about 100 ms later</span>
          </h3>
          <div className={styles.surface}>
            <TableArt />
            <div ref={dotsRef} className={styles.dots} aria-hidden="true">
              {Array.from({ length: DOT_POOL }, (_, index) => (
                <span key={index} className={styles.dot} />
              ))}
            </div>
            <span ref={remoteHandRef} className={styles.hand}>
              <Hand seat="atreides" label="You" />
            </span>
          </div>
        </section>
      </div>
      <div className={styles.controls}>
        <UnstyledButton
          className={clsx(styles.toggle, smoothing && styles.toggleOn)}
          aria-pressed={smoothing}
          onClick={() => setSmoothing((value) => !value)}
        >
          <span className={styles.switch} aria-hidden="true" />
          Smoothing {smoothing ? 'on' : 'off'}
        </UnstyledButton>
        <span className={styles.note}>
          Each dot is one position as it arrives: 20 a second at most, sent on in 50 ms batches.
        </span>
      </div>
    </div>
  );
}
