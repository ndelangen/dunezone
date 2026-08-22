/**
 * The single source of truth for generated image variants, shared by the generator (scripts/generate-images.ts), the structural verifier, and the runtime resolver.
 * Decided on the wayfinder map (#250): formats are declared by usage intent, never sniffed from source pixels;
 * sizes cover ~2× the largest rendered size per category;
 * JPEG tiers are progressive (the only shippable format with progressive rendering);
 * print tiers are JPEG for PDF DCT passthrough eligibility.
 */

export type AssetFormat = 'jpeg' | 'webp' | 'png';
export type AssetSize = 'small' | 'large' | 'print';

export type CategoryRule = {
  /** Output format for all size tiers. Extension: jpeg→jpg, webp→webp, png→png. */
  format: AssetFormat;
  /** Encode single-channel grayscale (textures are always black & white). */
  grayscale?: boolean;
  /**
   * Usage intent: does this category's UI slot require an alpha channel?
   * The generator fails loudly when an opaque category receives a genuinely transparent source: a human decides, and nothing is silently flattened.
   */
  transparent: boolean;
  /** Tier widths in px; `null` means native size (never upscale). */
  sizes: { small: number; large: number | null; print?: number };
  /** Max width of the safety-net re-encode written at the canonical name. */
  safetyCapPx: number;
  /** Encode quality (JPEG/WebP). Adjusted at visual sign-off (#274). */
  quality: number;
};

export const ASSET_RULES: Record<string, CategoryRule> = {
  'image/texture': {
    format: 'jpeg',
    grayscale: true,
    transparent: false,
    sizes: { small: 256, large: 640, print: 1280 },
    safetyCapPx: 1280,
    quality: 80,
  },
  'image/leader': {
    format: 'webp',
    transparent: true,
    sizes: { small: 128, large: null },
    safetyCapPx: 1600,
    quality: 84,
  },
  'image/planet': {
    format: 'png',
    transparent: true,
    sizes: { small: 256, large: 640 },
    safetyCapPx: 1600,
    quality: 90,
  },
  'image/shield': {
    format: 'webp',
    transparent: true,
    sizes: { small: 256, large: 640 },
    safetyCapPx: 1600,
    quality: 84,
  },
  'image/card': {
    format: 'webp',
    transparent: true,
    sizes: { small: 256, large: 640 },
    safetyCapPx: 1600,
    quality: 84,
  },
  'image/background': {
    format: 'jpeg',
    transparent: false,
    sizes: { small: 256, large: 640 },
    safetyCapPx: 1600,
    quality: 80,
  },
  web: {
    format: 'jpeg',
    transparent: false,
    sizes: { small: 1080, large: 2048 },
    safetyCapPx: 2048,
    quality: 80,
  },
};

export const FORMAT_EXTENSION: Record<AssetFormat, string> = {
  jpeg: 'jpg',
  webp: 'webp',
  png: 'png',
};

/**
 * Files under `public/web/` that are committed rather than produced from `media/`, each naming the change that added it.
 * One list, read by both sides, because two lists is how this broke: `generate-images.ts` cleared `public/web/` while sparing a single hardcoded name, and `no-deck-back.svg` arrived later without anyone updating that name.
 * Every generate run then deleted the dangling-deck fallback the resolver serves, and CI publishes what generate leaves behind, so the deployed URL 404'd and no check said so.
 * A file added here is spared by the generator and expected by the verifier in the same edit.
 */
export const COMMITTED_WEB_FILES = [
  /* The site logo, committed since the web tree existed. */
  'logo.svg',
  /* The dangling deck-back fallback the resolver serves («What does each back mode publish», amended by «How a dangling back reference presents»). */
  'no-deck-back.svg',
] as const;

/** Category rule for a canonical asset key like `/image/texture/021.jpg` or `/web/head.png`. */
export function ruleForKey(key: string): CategoryRule | undefined {
  const trimmed = key.replace(/^\//, '');
  const [first, second] = trimmed.split('/');
  return ASSET_RULES[`${first}/${second}`] ?? ASSET_RULES[first ?? ''];
}
