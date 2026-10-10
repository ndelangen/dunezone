import sharp from 'sharp';
import { describe, expect, test } from 'vitest';

import lockJson from '../media/raster.lock.json';
import { legacyVariant } from '../src/shared/media/legacyVariant';
import { MEDIA_CANONICAL_RECIPES, MEDIA_RECIPES } from '../src/shared/media/map.generated';
import type { RasterLock, RasterLockEntry } from '../src/shared/media/rasterLock';
import { resolveAsset } from '../src/shared/media/resolveAsset';
import {
  assertEncodable,
  canonicalRecipes,
  checksumRecord,
  matchesRecord,
  planVariants,
  recipeHash,
  tierRecipes,
  variantName,
} from './media-variants';

const VERSIONS = { vips: '8.17.2', sharp: '0.34.4', mozjpeg: '4.1.5' };
const SHA256 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function entry(overrides: Partial<RasterLockEntry> = {}): RasterLockEntry {
  return {
    sha256: SHA256,
    bytes: 10,
    width: 4000,
    height: 3000,
    format: 'jpeg',
    isOpaque: true,
    color: '#000000',
    ...overrides,
  };
}

describe('media variants', () => {
  test('plans one variant per declared tier plus the canonical re-encode, at today’s legacy paths', () => {
    const plan = planVariants('/image/texture/021.jpg', entry(), VERSIONS);

    expect(plan.map((variant) => [variant.recipe.tier, variant.legacyPath])).toEqual([
      ['small', 'image/texture/021-small.jpg'],
      ['large', 'image/texture/021-large.jpg'],
      ['print', 'image/texture/021-print.jpg'],
      ['canonical', 'image/texture/021.jpg'],
    ]);
    for (const variant of plan) {
      expect(variant.name).toMatch(/^0123456789abcdef0123\.[0-9a-f]{10}\.jpg$/);
    }
    expect(new Set(plan.map((variant) => variant.name)).size).toBe(plan.length);
  });

  test('keeps a PNG canonical as PNG while its tiers follow the category format', () => {
    const plan = planVariants('/image/leader/alien/buzcle.png', entry({ format: 'png' }), VERSIONS);
    const canonical = plan.find((variant) => variant.recipe.tier === 'canonical');

    expect(canonical?.legacyPath).toBe('image/leader/alien/buzcle.png');
    expect(canonical?.recipe).toMatchObject({ format: 'png', palette: true, compressionLevel: 9 });
    expect(canonical?.name.endsWith('.png')).toBe(true);
  });

  test('names stay stable for the same inputs and move with the source, the recipe or the encoder', () => {
    const [small] = planVariants('/image/texture/021.jpg', entry(), VERSIONS);

    expect(variantName(SHA256, small.recipe, { ...VERSIONS })).toBe(small.name);
    expect(recipeHash(small.recipe, { mozjpeg: '4.1.5', sharp: '0.34.4', vips: '8.17.2' })).toBe(
      recipeHash(small.recipe, VERSIONS)
    );
    expect(variantName('f'.repeat(64), small.recipe, VERSIONS)).not.toBe(small.name);
    expect(variantName(SHA256, { ...small.recipe, quality: small.recipe.quality + 1 }, VERSIONS)).not.toBe(small.name);
    expect(variantName(SHA256, small.recipe, { ...VERSIONS, vips: '8.18.0' })).not.toBe(small.name);
  });

  test('accepts for encoding only art under a rule, opaque where its category demands it', () => {
    expect(() => assertEncodable('/image/leader/alien/x.png', entry({ isOpaque: false }))).not.toThrow();
    expect(() => assertEncodable('/image/texture/021.jpg', entry({ isOpaque: true }))).not.toThrow();
    expect(() => assertEncodable('/image/texture/021.jpg', entry({ isOpaque: false }))).toThrow(/declared opaque/);
    expect(() => assertEncodable('/image/unknown/x.png', entry())).toThrow(/No asset rule covers/);
  });

  test('refuses a key no rule covers', () => {
    expect(() => planVariants('/image/unknown-category/a.png', entry(), VERSIONS)).toThrow(/No asset rule covers/);
  });

  test('a checksum record accepts only the exact bytes it was made from', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const record = checksumRecord(bytes);

    expect(matchesRecord(bytes, record)).toBe(true);
    expect(matchesRecord(new Uint8Array([1, 2, 4]), record)).toBe(false);
    expect(matchesRecord(new Uint8Array([1, 2]), record)).toBe(false);
  });
});

describe('the committed media map', () => {
  const fix = 'run `bun run media:lock`';

  test('carries the recipe names of the installed encoder', () => {
    expect(MEDIA_RECIPES, fix).toEqual(tierRecipes(sharp.versions));
    expect(MEDIA_CANONICAL_RECIPES, fix).toEqual(canonicalRecipes(sharp.versions));
  });

  test('maps every legacy path to exactly the variant the encoder names', () => {
    const lock = lockJson as RasterLock;
    for (const [key, locked] of Object.entries(lock)) {
      for (const variant of planVariants(key, locked, sharp.versions)) {
        expect(legacyVariant(`/${variant.legacyPath}`), `${variant.legacyPath}: ${fix}`).toBe(variant.name);
      }
    }
  });

  test('makes resolveAsset emit exactly the name the encoder gives each tier', () => {
    const lock = lockJson as RasterLock;
    for (const [key, locked] of Object.entries(lock)) {
      for (const variant of planVariants(key, locked, sharp.versions)) {
        if (variant.recipe.tier !== 'canonical') {
          expect(resolveAsset(key, variant.recipe.tier), `${key} ${variant.recipe.tier}: ${fix}`).toBe(
            `/m/${variant.name}`
          );
        }
      }
    }
  });

  test('keeps the legacy path for a raster the lock does not list yet', () => {
    expect(resolveAsset('/image/texture/not-synced.jpg', 'small')).toBe('/image/texture/not-synced-small.jpg');
    expect(resolveAsset('/image/leader/new.png', 'print')).toBe('/image/leader/new-large.webp');
  });
});
