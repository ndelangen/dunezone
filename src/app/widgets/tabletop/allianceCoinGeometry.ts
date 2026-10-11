import { FACTION_TOKEN_SCALE, TABLE_SURFACE_Y, TROOP_TOP_RADIUS } from '@shared/play/tableGeometry';

export const ALLIANCE_TOKEN_RADIUS = TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE;

/*
 * Every faction token stands on a coin a band wider all round.
 * A token at its seat overhangs the board's rim and rests at the rim's height, so the coin stands on the table and rises to a little under the token, leaving the board's rim in view.
 * The coins of a large alliance share the width of two bands, so the ring never reaches the troop reserves behind the token or a neighbouring seat,
 * and share HEADROOM in height, so a token moved onto the bare table still shows its face above the innermost coin.
 */
export const COIN_BAND = 0.085;
const MAX_BANDS = 2;
const MIN_HEIGHT = 0.018;
const DROP = 0.024;
const COIN_STEP = 0.003;
const HEADROOM = 0.018;

/** The width of each coin's band beyond the one inside it. */
export function coinBand(count: number) {
  return COIN_BAND * Math.min(1, MAX_BANDS / count);
}

/** The radius of the coin at `index` from the token outwards. */
export function coinRadius(index: number, count: number) {
  return ALLIANCE_TOKEN_RADIUS + coinBand(count) * (index + 1);
}

/**
 * The height of the top of the coin at `index` under a token resting at `base`.
 * Each wider coin sits a step lower than the one above it, and the widest is never thinner than MIN_HEIGHT.
 */
export function coinTop(index: number, count: number, base: number) {
  const step = Math.min(COIN_STEP, HEADROOM / Math.max(1, count - 1));
  return Math.max(TABLE_SURFACE_Y + MIN_HEIGHT + (count - 1 - index) * step, base - DROP - index * step);
}
