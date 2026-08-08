/**
 * Per-category rules for the vector train (wayfinder #294, decided in #296/#297/#298): every
 * `media/vector/<category>/<name>.svg` source generates a normalized, optimized file at
 * `public/vector/<category>/<name>.svg`. Consumers keep referencing `/vector/<cat>/<name>.svg#root`
 * — the train changes bytes, never URLs.
 *
 * The one coordinate space: every generated file has viewBox `0 0 100 100`, art centered (`xMidYMid
 * meet` semantics), zero padding — the box is the art. `overflow="visible"` on the root is the
 * halo-clipping fix. Backgrounds' coordinates are genuinely rescaled in the path data because
 * fragment `<use href="…#arrakeen">` clones elements without ancestor transforms.
 *
 * Paint policy: `inherit` categories must carry NO baked paint (fill/stroke comes from the
 * consumer); `baked` requires the `-multicolor` name suffix within the decal category.
 */

export const VECTOR_VIEWBOX_SIZE = 100;
/** Output coordinate precision: 2 decimals = 1/10,000 of the box. */
export const VECTOR_PRECISION = 2;
/** Root attribute every generated file must carry so `<use href="…#root">` resolves. */
export const VECTOR_ROOT_ID = 'root';
/** Stamp the authoring tool writes on processed sources; verify warns (later: fails) without it. */
export const VECTOR_AUTHORED_ATTRIBUTE = 'data-authored';

type VectorPaintPolicy = 'inherit' | 'baked-when-multicolor';

export type VectorCategoryRule = {
  paint: VectorPaintPolicy;
  /** Preserve internal ids and group structure (fragment-id API files). */
  fragmentApi: boolean;
  /** Generate committed .obj game pieces from this category (TTS use, #309). */
  obj: boolean;
};

export const VECTOR_CATEGORY_RULES = {
  background: { paint: 'baked-when-multicolor', fragmentApi: true, obj: false },
  decal: { paint: 'baked-when-multicolor', fragmentApi: false, obj: false },
  generic: { paint: 'inherit', fragmentApi: false, obj: false },
  icon: { paint: 'baked-when-multicolor', fragmentApi: false, obj: false },
  logo: { paint: 'inherit', fragmentApi: false, obj: true },
  troop: { paint: 'inherit', fragmentApi: false, obj: true },
  // Fragment API: consumers paint #outline and #star separately (the old two-tone look).
  troop_modifier: { paint: 'inherit', fragmentApi: true, obj: true },
} as const satisfies Record<string, VectorCategoryRule>;

export type VectorCategory = keyof typeof VECTOR_CATEGORY_RULES;

const MULTICOLOR_SUFFIX = '-multicolor';

/**
 * The map's place-id API (`/vector/background/map.svg#<id>`), consumed by Spice.tsx and the rules
 * pages. The build fails if optimization drops any of these (#296 guard 5).
 */
export const MAP_PLACE_IDS = [
  'arrakeen',
  'arsunt',
  'basin',
  'bight-of-the-cliff',
  'broken-land',
  'carthag',
  'cielago-depression',
  'cielago-east',
  'cielago-north',
  'cielago-south',
  'cielago-west',
  'false-wall-east',
  'false-wall-south',
  'false-wall-west',
  'funeral-plain',
  'gara-kulon',
  'habbanya',
  'habbanya-erg',
  'habbanya-ridge-flat',
  'hagga-basin',
  'harg-pass',
  'hole-in-the-rock',
  'icons',
  'imperial-basin',
  'meridian',
  'old-gap',
  'pasty-mesa',
  'plastic-basin',
  'polar',
  'red-chasm',
  'rim-wall-west',
  'rock',
  'rock-outcroppings',
  'sand',
  'sectors',
  'shield-wall',
  'sihaya-ridge',
  'south-mesa',
  'strongholds',
  'tabr',
  'the-great-flat',
  'the-greater-flat',
  'the-minor-erg',
  'tsimpo',
  'tueks',
  'wind-pass',
  'wind-pass-north',
] as const;

/** Whether a file in a `baked-when-multicolor` category is allowed to carry baked paint. */
export function allowsBakedPaint(category: VectorCategory, fileName: string): boolean {
  const rule = VECTOR_CATEGORY_RULES[category];
  if (rule.paint === 'inherit') {
    return false;
  }
  if (category === 'background' || category === 'icon') {
    return true;
  }
  return fileName.replace(/\.svg$/, '').endsWith(MULTICOLOR_SUFFIX);
}
