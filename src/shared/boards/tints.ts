import { z } from 'zod';

/*
 * Territory tints, shared by the Play table and Spice cards: colours with their own fill opacity, stickers, and the territory IDs they cover.
 * The table draws them in 3D and a card draws them as SVG, from the same data.
 */

/** The colours the panel offers first, in its order; a tint can take any other colour too. */
export const TINT_COLORS = ['#2f7fe0', '#d63a2a', '#e8b923', '#3fae4a', '#9450d0', '#f2f2f2', '#1b1b1b'] as const;
export const TINT_COLOR_NAMES: Record<(typeof TINT_COLORS)[number], string> = {
  '#2f7fe0': 'Blue',
  '#d63a2a': 'Red',
  '#e8b923': 'Yellow',
  '#3fae4a': 'Green',
  '#9450d0': 'Purple',
  '#f2f2f2': 'White',
  '#1b1b1b': 'Black',
};
/* A tint's fill shows the board through it; a colour may carry its own see-through amount as two more hex digits. */
const DEFAULT_FILL_OPACITY = 0.5;

/** A tint colour split into its solid colour and how opaque its fill is. */
export function tintPaint(color: string) {
  const alpha = color.slice(7, 9);
  return { color: color.slice(0, 7), opacity: alpha ? Number.parseInt(alpha, 16) / 255 : DEFAULT_FILL_OPACITY };
}

/** A tint colour written with its fill opacity, as the colour picker shows it. */
export function withFillOpacity(color: string) {
  return color.length === 7 ? `${color}80` : color;
}

/** Stickers a tint may put on each of its territories, in the order they sit side by side. */
export const TINT_STAMPS = [
  'sietch',
  'landscape',
  'city',
  'shai_hulud',
  'spice_mine',
  'herb',
  'ornithopter',
  'spice',
  'explode',
  'block',
] as const;
export type TintStamp = (typeof TINT_STAMPS)[number];

/** Each sticker's name, as the panel and the log say it. */
export const TINT_STAMP_NAMES: Record<TintStamp, string> = {
  sietch: 'Sietch',
  landscape: 'Landscape',
  city: 'City',
  shai_hulud: 'Shai-Hulud',
  spice_mine: 'Spice mine',
  herb: 'Herb',
  ornithopter: 'Ornithopter',
  spice: 'Spice',
  explode: 'Explode',
  block: 'Block',
};

/* A territory is named by the ID its board derives from its name, so it reads the same on every board copy. */
export const tintTerritorySchema = z
  .string()
  .regex(/^[a-z0-9_]+$/)
  .max(128);
export const tintColorSchema = z.string().regex(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
export const tintStampsSchema = z.array(z.enum(TINT_STAMPS)).max(TINT_STAMPS.length);

/** Each sticker's bundled vector, for renderers that draw it as an image. */
export const TINT_STICKER_ARTWORK: Record<TintStamp, string> = {
  sietch: '/vector/icon/seitch.svg',
  landscape: '/vector/icon/landscape.svg',
  city: '/vector/icon/city.svg',
  shai_hulud: '/vector/icon/shai-hulud.svg',
  spice_mine: '/vector/icon/spice-mine.svg',
  herb: '/vector/icon/herb.svg',
  ornithopter: '/vector/icon/ornithopter.svg',
  spice: '/vector/icon/spice.svg',
  explode: '/vector/decal/atomics.svg',
  block: '/vector/decal/block.svg',
};
