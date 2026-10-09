import { describe, expect, test } from 'vitest';

import { legacyVariant } from './legacyVariant';
import { MEDIA_MAP } from './map.generated';
import { resolveAsset } from './resolveAsset';

describe('legacyVariant', () => {
  test('maps each tier URL to the variant resolveAsset names', () => {
    const key = '/image/texture/021.jpg';
    expect(legacyVariant('/image/texture/021-small.jpg')).toBe(resolveAsset(key, 'small').slice(3));
    expect(legacyVariant('/image/texture/021-print.jpg')).toBe(resolveAsset(key, 'print').slice(3));
    expect(legacyVariant('/image/leader/official/alia-large.webp')).toBe(
      resolveAsset('/image/leader/official/alia.png', 'large').slice(3)
    );
  });

  test('maps a canonical URL to the capped re-encode in the original format', () => {
    expect(legacyVariant('/image/texture/021.jpg')).toMatch(
      new RegExp(`^${MEDIA_MAP['/image/texture/021.jpg'][0]}\\.[0-9a-f]{10}\\.jpg$`)
    );
    expect(legacyVariant('/image/leader/official/alia.png')).toMatch(/\.png$/);
  });

  test('refuses tiers and formats the category never declared', () => {
    expect(legacyVariant(`/image/leader/official/alia-print.webp`)).toBeNull();
    expect(legacyVariant(`/image/leader/official/alia-large.png`)).toBeNull();
    expect(legacyVariant(`/image/texture/021-huge.jpg`)).toBeNull();
  });

  /* Template literals, because verify:images requires every quoted /image/ literal under src/ to exist. */
  test('leaves unlocked rasters and other files alone', () => {
    expect(legacyVariant(`/image/texture/not-locked-small.jpg`)).toBeNull();
    expect(legacyVariant(`/image/texture/not-locked.jpg`)).toBeNull();
    expect(legacyVariant('/web/logo.svg')).toBeNull();
  });
});
