import type { BackgroundData } from '@game/data/backgrounds';

export type Colour = BackgroundData['colors'][number];

/** Relative luminance of a six digit hex colour. */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink on a light colour, cream on a dark one, so every hex can be read off its own swatch. */
export function textOn(hex: string) {
  return luminance(hex) > 0.45 ? '#0b0503' : '#e3dbb3';
}

/** A flat colour's hex, or the hexes a split or gradient runs through. */
export function hexes(colour: Colour): string[] {
  return typeof colour === 'string' ? [colour] : colour.stops.map(([stop]) => stop);
}

/**
 * The CSS fill of a colour: the flat colour itself, or the split or gradient as the token wears it.
 * The token renderer measures angles from left to right, counterclockwise;
 * CSS measures from the bottom up, clockwise.
 */
export function fill(colour: Colour): string {
  if (typeof colour === 'string') {
    return colour;
  }
  const stops = colour.stops.map(([hex, at]) => `${hex} ${at * 100}%`);
  return colour.type === 'linear'
    ? `linear-gradient(${90 - colour.angle}deg, ${stops.join(', ')})`
    : `radial-gradient(${stops.join(', ')})`;
}
