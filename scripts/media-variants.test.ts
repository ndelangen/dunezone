import { describe, expect, test } from 'vitest';

import type { RasterLockEntry } from '../src/shared/media/rasterLock';
import { checksumRecord, matchesRecord, planVariants, recipeHash, variantName } from './media-variants';

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
