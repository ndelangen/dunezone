import { useEffect, useRef } from 'react';

import { FOIL_COLORS } from '../play/confettiSimulation';
import styles from './TutorialGuide.module.css';

/*
 * A burst of foil over the whole page as a chapter is done: two streams from the window's lower corners that arc in and flutter down.
 * The same foil colours as a game's result, drawn flat on a canvas above the page, so it never touches the table.
 * It plays once, ignores the pointer, and stays away for anyone who asked for less motion.
 */

const PIECES = 220;
const SECONDS = 4;
const GRAVITY = 600;
const DRAG = 1.1;

type Foil = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  turn: number;
  flip: number;
  size: number;
  color: string;
};

function burst(width: number, height: number): Foil[] {
  return Array.from({ length: PIECES }, (_, index) => {
    /* Every other piece fires from the right, pointing in toward the middle of the page. */
    const inward = index % 2 === 0 ? 1 : -1;
    /* Steep, and fanned, so the streams cross high over the middle of the page. */
    const elevation = 0.85 + Math.random() * 0.5;
    const speed = 1400 + Math.random() * 1100;
    return {
      x: inward === 1 ? 0 : width,
      y: height,
      vx: inward * Math.cos(elevation) * speed,
      vy: -Math.sin(elevation) * speed,
      spin: Math.random() * Math.PI * 2,
      turn: (Math.random() - 0.5) * 12,
      flip: Math.random() * Math.PI * 2,
      size: 6 + Math.random() * 6,
      color: FOIL_COLORS[index % FOIL_COLORS.length]!,
    };
  });
}

/* Runs the burst on the canvas until it has fallen, and gives back what stops it early. */
function play(context: CanvasRenderingContext2D, width: number, height: number) {
  const foil = burst(width, height);
  let last = performance.now();
  const started = last;
  let frame = requestAnimationFrame(function draw(now) {
    const step = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const age = (now - started) / 1000;
    context.clearRect(0, 0, width, height);
    /* The last second fades the foil out, so it leaves rather than vanishes. */
    context.globalAlpha = Math.max(0, Math.min(1, SECONDS - age));
    for (const piece of foil) {
      piece.vx -= piece.vx * DRAG * step;
      piece.vy += (GRAVITY - piece.vy * DRAG) * step;
      piece.x += piece.vx * step;
      piece.y += piece.vy * step;
      piece.spin += piece.turn * step;
      piece.flip += 9 * step;
      context.save();
      context.translate(piece.x, piece.y);
      context.rotate(piece.spin);
      /* A disc turning over in the air reads as an ellipse that narrows and widens. */
      context.scale(1, Math.cos(piece.flip));
      context.fillStyle = piece.color;
      context.beginPath();
      context.ellipse(0, 0, piece.size / 2, piece.size / 2, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
    if (age < SECONDS) {
      frame = requestAnimationFrame(draw);
    } else {
      context.clearRect(0, 0, width, height);
    }
  });
  return () => cancelAnimationFrame(frame);
}

export function ChapterConfetti() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const scale = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;
    element.width = width * scale;
    element.height = height * scale;
    context.scale(scale, scale);
    return play(context, width, height);
  }, []);

  return <canvas ref={canvas} className={styles.confetti} aria-hidden data-chapter-confetti />;
}
