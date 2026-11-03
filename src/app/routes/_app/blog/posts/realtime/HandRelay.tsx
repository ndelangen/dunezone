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
 * Hands and dots are placed with `translate` in container units of their pane, so a frame changes nothing but a composited transform; the loop sleeps while the figure is out of view and whenever nothing is left to move, and both hands keep their places while it does.
 */

const SAMPLE_MS = 50;
const BATCH_MS = 50;
const SMOOTHING_RATE = 24;
/** How quickly the hand drifts back to the wander path once the reader has left it alone. */
const RETURN_RATE = 5;
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

/** Puts an element at a share of its pane, as a translate the compositor applies without a layout. */
function place(element: HTMLElement, point: Point) {
  element.style.translate = `${point.x * 100}cqw ${point.y * 100}cqh`;
}

/** Moves a share of the way from one point towards another. */
function ease(from: Point, to: Point, amount: number): Point {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
  };
}

/** When a position sent now reaches the other player: the wire to the room, the room's next 50 ms batch, and the wire back out. */
function arrivalTime(now: number) {
  const atRoom = now + latency();
  return Math.ceil(atRoom / BATCH_MS) * BATCH_MS + latency();
}

type Positions = { local: Point; target: Point; shown: Point };
type Elements = { localHand: HTMLElement; remoteHand: HTMLElement; dots: HTMLElement[] };
type Input = { held: Point | null; wander: boolean; smoothing: boolean };

/**
 * One run of the demo: the reader's hand, the positions on the wire, and the copy the other player draws.
 * It keeps its state between frames, and hands its positions back so a pause leaves both hands where they were.
 */
class Relay {
  private positions: Positions;
  private lastSent: Point | null = null;
  private lastSampleAt = 0;
  private readonly inFlight: { point: Point; arrives: number }[] = [];
  private readonly dotAges: number[];
  private nextDot = 0;
  private lastDotAt = Number.NEGATIVE_INFINITY;

  private readonly elements: Elements;

  constructor(elements: Elements, start: Positions) {
    this.elements = elements;
    this.positions = start;
    this.dotAges = elements.dots.map(() => Number.NEGATIVE_INFINITY);
  }

  /** Moves everything on by one frame; false once nothing is left to move. */
  frame(now: number, dt: number, input: Input): boolean {
    this.moveLocal(now, dt, input);
    this.send(now);
    this.receive(now);
    this.drawRemote(dt, input.smoothing);
    this.fadeDots(now);
    const moving = Boolean(input.held) || input.wander || this.inFlight.length > 0;
    return moving || !this.settled(now);
  }

  get current(): Positions {
    return this.positions;
  }

  /** The hand under the reader's pointer, or the wander path once they have left it alone for a while, which it drifts back to rather than jumping. */
  private moveLocal(now: number, dt: number, { held, wander: wandering }: Input) {
    const { local } = this.positions;
    let next = local;
    if (held) {
      next = held;
    } else if (wandering) {
      next = ease(local, wander(now), 1 - Math.exp(-RETURN_RATE * dt));
    }
    this.positions = { ...this.positions, local: next };
    place(this.elements.localHand, next);
  }

  /** A position leaves at most every 50 ms, and only when the hand moved. */
  private send(now: number) {
    const { local } = this.positions;
    const moved = !this.lastSent || this.lastSent.x !== local.x || this.lastSent.y !== local.y;
    if (now - this.lastSampleAt < SAMPLE_MS || !moved) {
      return;
    }
    this.lastSampleAt = now;
    this.lastSent = local;
    this.inFlight.push({ point: local, arrives: arrivalTime(now) });
  }

  /** Every position that has arrived becomes the target, and leaves a dot where it landed. */
  private receive(now: number) {
    const { dots } = this.elements;
    while (this.inFlight.length > 0 && this.inFlight[0]!.arrives <= now) {
      const target = this.inFlight.shift()!.point;
      this.positions = { ...this.positions, target };
      place(dots[this.nextDot]!, target);
      this.dotAges[this.nextDot] = now;
      this.lastDotAt = now;
      this.nextDot = (this.nextDot + 1) % dots.length;
    }
  }

  private drawRemote(dt: number, smoothing: boolean) {
    const { target, shown } = this.positions;
    const next = smoothing ? ease(shown, target, 1 - Math.exp(-SMOOTHING_RATE * dt)) : target;
    this.positions = { ...this.positions, shown: next };
    place(this.elements.remoteHand, next);
  }

  /** Fades each dot out over its life. */
  private fadeDots(now: number) {
    this.elements.dots.forEach((dot, index) => {
      const age = now - this.dotAges[index]!;
      dot.style.opacity = age < DOT_LIFE_MS ? String(1 - age / DOT_LIFE_MS) : '0';
    });
  }

  /** The shown hand has caught up with the last position it received, and the dots have gone. */
  private settled(now: number) {
    const { target, shown } = this.positions;
    return Math.hypot(target.x - shown.x, target.y - shown.y) < 0.0005 && now - this.lastDotAt > DOT_LIFE_MS;
  }
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
  const { armed, seen, active } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const [smoothing, setSmoothing] = useState(true);

  /* What the frame loop reads without re-rendering: the pointer, the setting and whether to wander. */
  const pointer = useRef<{ point: Point; at: number } | null>(null);
  const settings = useRef({ smoothing: true, wander: true });
  /* Wakes the loop after it has settled, which a pointer move does. */
  const wake = useRef<() => void>(() => {});
  /* Where the hands are, kept between runs of the loop so a pause leaves them where they were. */
  const positions = useRef<{ local: Point; target: Point; shown: Point }>({
    local: { x: 0.5, y: 0.5 },
    target: { x: 0.5, y: 0.5 },
    shown: { x: 0.5, y: 0.5 },
  });
  useEffect(() => {
    settings.current = { smoothing, wander: !reduced };
    wake.current();
  }, [smoothing, reduced]);

  const running = armed && seen && active;

  useEffect(() => {
    const localHand = localHandRef.current;
    const remoteHand = remoteHandRef.current;
    const dotLayer = dotsRef.current;
    if (!running || !localHand || !remoteHand || !dotLayer) {
      return;
    }
    const dots = Array.from(dotLayer.children) as HTMLElement[];
    const relay = new Relay({ localHand, remoteHand, dots }, positions.current);
    let lastFrame = performance.now();
    let frame = 0;
    let awake = false;

    const step = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - lastFrame) / 1000));
      lastFrame = now;
      const held = pointer.current;
      const input = {
        held: held && now - held.at < IDLE_MS ? held.point : null,
        ...settings.current,
      };
      const more = relay.frame(now, dt, input);
      positions.current = relay.current;
      /* Nothing left to move: no pointer, no wander, nothing in the air, the hand home and the dots gone. The loop sleeps until woken. */
      if (!more) {
        awake = false;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (awake) {
        return;
      }
      awake = true;
      lastFrame = performance.now();
      frame = requestAnimationFrame(step);
    };
    wake.current = start;
    start();
    return () => {
      wake.current = () => {};
      awake = false;
      cancelAnimationFrame(frame);
    };
  }, [running]);

  const onPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    pointer.current = {
      point: {
        x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
        y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
      },
      at: performance.now(),
    };
    wake.current();
  };

  return (
    <div ref={rootRef} className={styles.root}>
      <div className={styles.panes}>
        <section className={styles.pane} aria-label="Your screen">
          <h3 className={styles.paneTitle}>
            Your screen <span className={styles.sub}>move over the table</span>
          </h3>
          <div
            className={clsx(styles.surface, styles.touchable, running && styles.running)}
            onPointerMove={onPointer}
            onPointerDown={onPointer}
          >
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
          Smoothing{' '}
          <span className={styles.state} aria-hidden="true">
            {smoothing ? 'on' : 'off'}
          </span>
        </UnstyledButton>
        <span className={styles.note}>
          Each dot is one position as it arrives: 20 a second at most, sent on in 50 ms batches.
        </span>
      </div>
    </div>
  );
}
