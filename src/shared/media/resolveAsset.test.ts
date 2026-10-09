import { describe, expect, test } from 'vitest';

import { MEDIA_MAP, MEDIA_RECIPES } from './map.generated';
import { resolveAsset } from './resolveAsset';

/** The variant URL the committed map names for a key, category tier and extension. */
function variant(key: string, category: string, tier: 'small' | 'large' | 'print', extension: string): string {
  return `/m/${MEDIA_MAP[key][0]}.${MEDIA_RECIPES[category][tier]}.${extension}`;
}

describe('resolveAsset', () => {
  test('resolves texture tiers to grayscale progressive JPEG variants', () => {
    const key = '/image/texture/021.jpg';
    expect(resolveAsset(key, 'small')).toBe(variant(key, 'image/texture', 'small', 'jpg'));
    expect(resolveAsset(key, 'large')).toBe(variant(key, 'image/texture', 'large', 'jpg'));
    expect(resolveAsset(key, 'print')).toBe(variant(key, 'image/texture', 'print', 'jpg'));
  });

  test('resolves transparent categories to WebP and falls print back to large', () => {
    const leader = '/image/leader/official/alia.png';
    expect(resolveAsset(leader, 'large')).toBe(variant(leader, 'image/leader', 'large', 'webp'));
    expect(resolveAsset(leader, 'print')).toBe(variant(leader, 'image/leader', 'large', 'webp'));
    const card = '/image/card/base-full.png';
    expect(resolveAsset(card, 'large')).toBe(variant(card, 'image/card', 'large', 'webp'));
  });

  test('keeps planets PNG', () => {
    expect(resolveAsset('/image/planet/01.png', 'small')).toBe(
      variant('/image/planet/01.png', 'image/planet', 'small', 'png')
    );
  });

  test('resolves web shell imagery to progressive JPEG', () => {
    expect(resolveAsset('/web/head.png', 'large')).toBe(variant('/web/head.png', 'web', 'large', 'jpg'));
    expect(resolveAsset('/web/page.jpg', 'small')).toBe(variant('/web/page.jpg', 'web', 'small', 'jpg'));
  });

  test('every resolved variant is a content-addressed /m name', () => {
    for (const key of Object.keys(MEDIA_MAP)) {
      expect(resolveAsset(key, 'small')).toMatch(/^\/m\/[0-9a-f]{20}\.[0-9a-f]{10}\.(jpg|webp|png)$/);
    }
  });

  test('passes vectors and unknown keys through unchanged', () => {
    expect(resolveAsset('/vector/logo/atreides.svg', 'large')).toBe('/vector/logo/atreides.svg');
    expect(resolveAsset('/web/logo.svg', 'large')).toBe('/web/logo.svg');
    expect(resolveAsset('/somewhere/else.txt', 'large')).toBe('/somewhere/else.txt');
  });
});
