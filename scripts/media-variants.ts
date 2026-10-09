/**
 * Content-addressed names for encoded raster variants (#1888 step 3).
 *
 * A variant is named `<src20>.<recipe10>.<ext>`: the start of the original's SHA-256 and a hash of everything that decides the encoded bytes.
 * The recipe covers the tier's rule (width, format, quality, grayscale and the encoder flags), the exact sharp, libvips and mozjpeg versions, and ENCODER_REVISION.
 * So an unchanged original under an unchanged recipe always has the same name, and is never encoded twice.
 * The same name is the key in the `dunezone-media` bucket (`v/<name>`) and the path the Worker serves (`/m/<name>`).
 */
import { createHash } from 'node:crypto';

import { ASSET_RULES, FORMAT_EXTENSION, categoryForKey } from '../src/shared/assetRules';
import type { AssetFormat, AssetSize, CategoryRule } from '../src/shared/assetRules';
import type { MediaRecipes, RasterLockEntry } from '../src/shared/media/rasterLock';

/** Bump to re-encode every variant when encoder behaviour changes in a way the versions and rules do not capture. */
export const ENCODER_REVISION = 1;

const RASTER = /\.(png|jpe?g)$/i;

export type VariantTier = 'small' | 'large' | 'print' | 'canonical';

/** Everything the encoder reads to produce one variant's bytes. */
export type VariantRecipe = {
  category: string;
  tier: VariantTier;
  /** Target width; null keeps the original width. The encoder never upscales. */
  width: number | null;
  format: AssetFormat;
  quality: number;
  grayscale: boolean;
  palette: boolean;
  progressive: boolean;
  mozjpeg: boolean;
  compressionLevel: number | null;
  kernel: 'lanczos3';
};

export type EncoderVersions = Readonly<Record<string, string | undefined>>;

export type PlannedVariant = {
  /** Canonical asset key of the original, such as `/image/texture/021.jpg`. */
  key: string;
  recipe: VariantRecipe;
  /** `<src20>.<recipe10>.<ext>` */
  name: string;
  /** Where today's static layout expects this variant, relative to `public/`. */
  legacyPath: string;
};

/** The SHA-256 and byte length a variant must match before anything uses it. */
export type ChecksumRecord = { sha256: string; bytes: number };

function canonicalFormat(key: string): AssetFormat {
  const extension = key.match(RASTER)?.[1]?.toLowerCase();
  return extension === 'png' ? 'png' : 'jpeg';
}

/** One encoding target of a category: which tier, at what width and in which format. */
type TierTarget = { tier: VariantTier; width: number | null; format: AssetFormat };

function recipeFor(category: string, rule: CategoryRule, { tier, width, format }: TierTarget) {
  return {
    category,
    tier,
    width,
    format,
    quality: rule.quality,
    grayscale: rule.grayscale ?? false,
    palette: format === 'png',
    progressive: format === 'jpeg',
    mozjpeg: format === 'jpeg',
    compressionLevel: format === 'png' ? 9 : null,
    kernel: 'lanczos3',
  } satisfies VariantRecipe;
}

/** JSON with object keys sorted at every depth, so the hash does not depend on property order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function recipeHash(recipe: VariantRecipe, versions: EncoderVersions): string {
  const identity = canonicalJson({ recipe, versions, revision: ENCODER_REVISION });
  return createHash('sha256').update(identity).digest('hex').slice(0, 10);
}

export function variantName(sourceSha256: string, recipe: VariantRecipe, versions: EncoderVersions): string {
  return `${sourceSha256.slice(0, 20)}.${recipeHash(recipe, versions)}.${FORMAT_EXTENSION[recipe.format]}`;
}

/** The declared size tiers of a rule, each with its target width. */
function declaredTiers(rule: CategoryRule): [AssetSize, number | null][] {
  return Object.entries(rule.sizes).filter((tier): tier is [AssetSize, number | null] => tier[1] !== undefined);
}

/**
 * The recipe name of every declared size tier, by category, for the committed media map.
 * The runtime resolver joins it to an original's `src20`, so a URL it emits is exactly the name `planVariants` gives that variant.
 */
export function tierRecipes(versions: EncoderVersions): Record<string, MediaRecipes> {
  return Object.fromEntries(
    Object.keys(ASSET_RULES)
      .sort((left, right) => left.localeCompare(right))
      .map((category) => {
        const rule = ASSET_RULES[category];
        const recipes = declaredTiers(rule).map(([tier, width]) => [
          tier,
          recipeHash(recipeFor(category, rule, { tier, width, format: rule.format }), versions),
        ]);
        return [category, Object.fromEntries(recipes)];
      })
  );
}

/** Every variant one original needs: one per declared size tier, plus the capped re-encode at the canonical name. */
export function planVariants(key: string, entry: RasterLockEntry, versions: EncoderVersions): PlannedVariant[] {
  const category = categoryForKey(key);
  const rule = category ? ASSET_RULES[category] : undefined;
  if (!category || !rule) {
    throw new Error(`No asset rule covers ${key}`);
  }
  const relative = key.replace(/^\//, '');
  const base = relative.replace(RASTER, '');
  const tiers = declaredTiers(rule).map(([tier, width]) => ({
    recipe: recipeFor(category, rule, { tier, width, format: rule.format }),
    legacyPath: `${base}-${tier}.${FORMAT_EXTENSION[rule.format]}`,
  }));
  const canonical = {
    recipe: recipeFor(category, rule, { tier: 'canonical', width: rule.safetyCapPx, format: canonicalFormat(key) }),
    legacyPath: relative,
  };
  return [...tiers, canonical].map(({ recipe, legacyPath }) => ({
    key,
    recipe,
    name: variantName(entry.sha256, recipe, versions),
    legacyPath,
  }));
}

export function checksumRecord(bytes: Uint8Array): ChecksumRecord {
  return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength };
}

/** True only when the bytes match the record exactly, so a truncated or replaced file is never reused. */
export function matchesRecord(bytes: Uint8Array, record: ChecksumRecord): boolean {
  const actual = checksumRecord(bytes);
  return actual.bytes === record.bytes && actual.sha256 === record.sha256;
}
