/**
 * The raster lock (`media/raster.lock.json`, #1888) records every raster original by content: its SHA-256, size, dimensions and the colour the UI paints behind it.
 * It is machine-owned and written by `bun run media:lock`.
 * Readers use it instead of the original bytes, so they keep working once the originals leave the git tree.
 */
import type { AssetSize } from '../assetRules';

export type RasterLockEntry = {
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  /** Matches sharp's `stats().isOpaque`: no pixel is even partly transparent. */
  isOpaque: boolean;
  /** Dominant colour as `#rrggbb`, painted behind the image while it loads (#255). */
  color: string;
};

/** Keyed by canonical asset key, such as `/image/texture/021.jpg`. */
export type RasterLock = Record<string, RasterLockEntry>;

/** The recipe name (`recipe10`) of each size tier a category declares. */
export type MediaRecipes = Readonly<Partial<Record<AssetSize, string>>>;

/** The recipe name of the canonical re-encode for each format an original can have. */
export type CanonicalRecipes = Readonly<Record<RasterLockEntry['format'], string>>;

/** The first 20 hex characters of the source SHA-256, which name the variants in R2. */
export type MediaMapEntry = readonly [src20: string, color: string];

export const RASTER_SOURCE = /\.(png|jpe?g)$/i;

/** The runtime map is derived from the lock alone, so it can be checked without any image bytes. */
export function buildMediaMap(lock: RasterLock): Record<string, MediaMapEntry> {
  return Object.fromEntries(
    Object.entries(lock)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, [entry.sha256.slice(0, 20), entry.color] as const])
  );
}
