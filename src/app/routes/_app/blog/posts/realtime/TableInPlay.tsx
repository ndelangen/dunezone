import { resolveAsset } from '@shared/media/resolveAsset';
import { PublishedImage } from '@ui/content/PublishedImage';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

import { useReducedMotion } from './motion';
import { GROUND, HAND_PATH } from './palette';
import styles from './TableInPlay.module.css';
import { useSeen } from './useSeen';

/*
 * The post's closing picture: a real capture of the table in Turn 1's Shipment and Movement, with the other players' hands moving over it.
 * The capture is a still, so the hands are drawn on top: five pointers in player colours that wander between the pieces, pause as if thinking, and now and then dart to a deck.
 * Every hand's pretend pointer is sampled twenty times a second and the drawn hand glides after it with the table's own smoothing, so they move the way hands on the real table do.
 * Positions are percentages of the picture, so the hands stay on their pieces at any width; until scripts run, and under reduced motion, each rests at its starting spot.
 * A frame only changes each hand's `translate`, which the compositor applies without a layout, and the loop runs only while the figure is in view; the hands keep their places while it rests, so nobody jumps when the reader comes back.
 */

const IMAGE_KEY = '/web/blog/playing-dune-online-in-real-time/table-in-play.jpg';
const ASPECT = 1110 / 2048;
const ALT =
  'The dune.zone game table during Shipment and Movement of a six-player game: the Dune board with troops, the storm marker, spice, and the decks and faction shields around it';

type Point = { x: number; y: number };

/** Places on the board worth pointing at, as percentages of the picture. */
const SPOTS: readonly Point[] = [
  { x: 49.4, y: 35.5 },
  { x: 49.3, y: 16.1 },
  { x: 57.6, y: 14.8 },
  { x: 81.1, y: 27.2 },
  { x: 48.7, y: 72.9 },
  { x: 45.2, y: 11.1 },
  { x: 50, y: 11.1 },
  { x: 73, y: 66.4 },
  { x: 73.4, y: 47.5 },
  { x: 63.9, y: 48.7 },
  { x: 36.4, y: 45.2 },
  { x: 31.3, y: 21.9 },
];

/** The decks a hand darts to once in a while, far from wherever it is. */
const DECKS: readonly Point[] = [
  { x: 88.3, y: 26.3 },
  { x: 11.9, y: 26.3 },
];

type Player = { name: string; color: string; dark?: boolean; start: Point; speed: number };

const PLAYERS: readonly Player[] = [
  { name: 'Player 2', color: '#2a4a9a', dark: true, start: { x: 34.9, y: 26.1 }, speed: 22 },
  { name: 'Player 3', color: '#e0702a', start: { x: 59.4, y: 19.9 }, speed: 30 },
  { name: 'Player 4', color: '#1c1c1c', dark: true, start: { x: 48.9, y: 25.4 }, speed: 18 },
  { name: 'Player 5', color: '#4f5b1a', dark: true, start: { x: 68.1, y: 46.4 }, speed: 26 },
  { name: 'Player 6', color: '#d9a520', start: { x: 40.8, y: 60.7 }, speed: 34 },
];

const SAMPLE_MS = 50;
const SMOOTHING_RATE = 24;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, (a.y - b.y) * ASPECT);
}

function between(low: number, high: number) {
  return low + Math.random() * (high - low);
}

/*
 * One pretend player: a pointer that travels to a goal at its own pace, rests there with small jitters, then picks a new goal.
 * The goal is usually one of the nearer spots; now and then it is a deck, reached in a hurry.
 */
class Wanderer {
  pointer: Point;
  goal: Point;
  restUntil = 0;
  jitter: Point = { x: 0, y: 0 };
  speed: number;
  private readonly baseSpeed: number;

  constructor(start: Point, speed: number) {
    this.pointer = { ...start };
    this.goal = { ...start };
    this.baseSpeed = speed;
    this.speed = speed;
    this.restUntil = performance.now() + between(400, 2200);
  }

  private pickGoal() {
    if (Math.random() < 0.07) {
      this.speed = this.baseSpeed * 2.2;
      return DECKS[Math.floor(Math.random() * DECKS.length)]!;
    }
    this.speed = this.baseSpeed * between(0.7, 1.2);
    const nearest = [...SPOTS]
      .filter((spot) => distance(spot, this.pointer) > 2)
      .sort((a, b) => distance(a, this.pointer) - distance(b, this.pointer))
      .slice(0, 5);
    const spot = nearest[Math.floor(Math.random() * nearest.length)]!;
    /* Nobody points at the exact middle of a piece. */
    return { x: spot.x + between(-1.2, 1.2), y: spot.y + between(-1.5, 1.5) };
  }

  step(now: number, dt: number) {
    if (now < this.restUntil) {
      /* Resting: a slow drift of a few tenths of a percent, like a hand that is not quite still. */
      this.jitter = {
        x: this.jitter.x + (between(-0.6, 0.6) - this.jitter.x) * Math.min(1, dt * 1.5),
        y: this.jitter.y + (between(-0.6, 0.6) - this.jitter.y) * Math.min(1, dt * 1.5),
      };
      return;
    }
    const dx = this.goal.x - this.pointer.x;
    const dy = this.goal.y - this.pointer.y;
    const remaining = Math.hypot(dx, dy);
    if (remaining < 0.4) {
      this.pointer = { ...this.goal };
      this.restUntil = now + between(700, 3200);
      this.goal = this.pickGoal();
      return;
    }
    /* Ease out toward the goal: quick to leave, slow to arrive. */
    const travel = Math.min(remaining, Math.max(this.speed * dt * Math.min(1, remaining / 8 + 0.25), 0.05));
    this.pointer = { x: this.pointer.x + (dx / remaining) * travel, y: this.pointer.y + (dy / remaining) * travel };
    this.jitter = { x: this.jitter.x * 0.9, y: this.jitter.y * 0.9 };
  }

  position(): Point {
    return { x: this.pointer.x + this.jitter.x, y: this.pointer.y + this.jitter.y };
  }
}

function PlayerHand({ player, handRef }: { player: Player; handRef: (element: HTMLSpanElement | null) => void }) {
  return (
    <span
      ref={handRef}
      className={styles.hand}
      style={
        {
          '--x': player.start.x,
          '--y': player.start.y,
          '--seat': player.color,
          '--ink': player.dark ? '#f0e8da' : '#171511',
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 26 32" className={styles.glyph}>
        <path
          d={HAND_PATH}
          fill={player.color}
          stroke={player.dark ? '#f0e8da' : GROUND}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.tag}>{player.name}</span>
    </span>
  );
}

export function TableInPlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const pictureRef = useRef<HTMLDivElement>(null);
  const hands = useRef<(HTMLSpanElement | null)[]>([]);
  const { armed, seen, active } = useSeen(rootRef);
  const reduced = useReducedMotion();
  const playing = armed && seen && !reduced && active;
  const [pictureReady, setPictureReady] = useState(false);
  /* The pretend players and where their hands are drawn, kept between runs of the loop. */
  const players = useRef<{ wanderers: Wanderer[]; targets: Point[]; shown: Point[] } | null>(null);

  /* The picture's img arrives when `PublishedImage` decides to fetch it, so the layer watches for it and for its load; a picture that fails, or is reported missing, still lets the hands show over the sand. */
  useEffect(() => {
    const picture = pictureRef.current;
    if (!picture) {
      return;
    }
    let watched: HTMLImageElement | null = null;
    const ready = () => setPictureReady(true);
    const check = () => {
      if (picture.querySelector('[data-phase="missing"]')) {
        ready();
        return;
      }
      const image = picture.querySelector('img');
      if (!image || image === watched) {
        return;
      }
      watched?.removeEventListener('load', ready);
      watched?.removeEventListener('error', ready);
      watched = image;
      if (image.complete && image.naturalWidth > 0) {
        ready();
        return;
      }
      image.addEventListener('load', ready);
      image.addEventListener('error', ready);
    };
    const observer = new MutationObserver(check);
    observer.observe(picture, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-phase'],
    });
    check();
    return () => {
      observer.disconnect();
      watched?.removeEventListener('load', ready);
      watched?.removeEventListener('error', ready);
    };
  }, []);

  useEffect(() => {
    if (!playing) {
      return;
    }
    if (!players.current) {
      const wanderers = PLAYERS.map((player) => new Wanderer(player.start, player.speed));
      /* What each browser would receive: the pointer sampled every 50 ms, and the drawn hand gliding after it. */
      const targets = wanderers.map((wanderer) => wanderer.position());
      players.current = { wanderers, targets, shown: targets.map((point) => ({ ...point })) };
    }
    const { wanderers, targets, shown } = players.current;
    let lastSample = 0;
    let lastFrame = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - lastFrame) / 1000));
      lastFrame = now;
      const sample = now - lastSample >= SAMPLE_MS;
      if (sample) {
        lastSample = now;
      }
      const amount = 1 - Math.exp(-SMOOTHING_RATE * dt);
      wanderers.forEach((wanderer, index) => {
        wanderer.step(now, dt);
        if (sample) {
          targets[index] = wanderer.position();
        }
        const target = targets[index]!;
        const current = shown[index]!;
        current.x += (target.x - current.x) * amount;
        current.y += (target.y - current.y) * amount;
        const element = hands.current[index];
        if (element) {
          element.style.translate = `${current.x}cqw ${current.y}cqh`;
        }
      });
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const src = resolveAsset(IMAGE_KEY, 'large');

  return (
    <div
      ref={rootRef}
      className={styles.root}
      role="img"
      aria-label={`${ALT}. Five other players' hands move over it.`}
    >
      <div ref={pictureRef} className={styles.picture}>
        <PublishedImage src={src} name={ALT} aspect={ASPECT} radius="var(--mantine-radius-md)" raised />
        {/* `PublishedImage` draws its image only once the browser runs, so readers and crawlers without scripts get it here. */}
        <noscript>
          <img src={src} alt={ALT} className={styles.fallback} />
        </noscript>
      </div>
      <div className={clsx(styles.hands, !pictureReady && armed && styles.handsWaiting)} aria-hidden="true">
        {PLAYERS.map((player, index) => (
          <PlayerHand
            key={player.name}
            player={player}
            handRef={(element) => {
              hands.current[index] = element;
            }}
          />
        ))}
      </div>
    </div>
  );
}
