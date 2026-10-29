import type { CardDraw } from '@shared/play/cardDraw';

export const DRAW_FLIGHT_MS = 950;
export const DRAW_STAGGER_MS = 120;
const DRAW_PULSE_MS = 650;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

/** A card leaves flat, rises over the board and shrinks into the recipient's token without turning over. */
export function cardDrawPose(draw: CardDraw, elapsed: number) {
  const progress = clamp(elapsed / DRAW_FLIGHT_MS);
  const travel = 1 - (1 - clamp((progress - 0.1) / 0.9)) ** 3;
  const height = Math.sin(travel * Math.PI) * 1.15 + Math.sin(progress * Math.PI) * 0.14;
  return {
    x: draw.from[0] + (draw.to[0] - draw.from[0]) * travel,
    y: draw.from[1] + (draw.to[1] - draw.from[1]) * travel + height + 0.025,
    z: draw.from[2] + (draw.to[2] - draw.from[2]) * travel,
    turn: draw.orientation + Math.sin(travel * Math.PI) * 0.18,
    scale: 1 - smooth((progress - 0.65) / 0.35) * 0.88,
    opacity: elapsed < 0 ? 0 : 1 - smooth((progress - 0.83) / 0.17),
  };
}

export function cardDrawDuration(count: number) {
  return DRAW_FLIGHT_MS + (count - 1) * DRAW_STAGGER_MS + DRAW_PULSE_MS;
}

/** The receiving token lights up as the first card reaches it and stays marked until the last arrives. */
export function cardDrawPulse(elapsed: number, count: number) {
  const progress = clamp((elapsed - DRAW_FLIGHT_MS) / ((count - 1) * DRAW_STAGGER_MS + DRAW_PULSE_MS));
  return {
    scale: 1 + progress * 0.55,
    opacity: elapsed < DRAW_FLIGHT_MS ? 0 : (1 - progress) * 0.9,
  };
}
