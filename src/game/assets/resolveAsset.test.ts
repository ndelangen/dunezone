import { describe, expect, test } from 'vitest';

import { resolveAsset } from './resolveAsset';

describe('resolveAsset', () => {
  test('resolves texture tiers to grayscale progressive JPEG variants', () => {
    expect(resolveAsset('/image/texture/021.jpg', 'small')).toBe('/image/texture/021-small.jpg');
    expect(resolveAsset('/image/texture/021.jpg', 'large')).toBe('/image/texture/021-large.jpg');
    expect(resolveAsset('/image/texture/021.jpg', 'print')).toBe('/image/texture/021-print.jpg');
  });

  test('resolves transparent categories to WebP and falls print back to large', () => {
    expect(resolveAsset('/image/leader/official/alia.png', 'large')).toBe(
      '/image/leader/official/alia-large.webp'
    );
    expect(resolveAsset('/image/leader/official/alia.png', 'print')).toBe(
      '/image/leader/official/alia-large.webp'
    );
    expect(resolveAsset('/image/card/base-full.png', 'large')).toBe(
      '/image/card/base-full-large.webp'
    );
  });

  test('keeps planets PNG', () => {
    expect(resolveAsset('/image/planet/01.png', 'small')).toBe('/image/planet/01-small.png');
  });

  test('resolves web shell imagery to progressive JPEG', () => {
    expect(resolveAsset('/web/head.png', 'large')).toBe('/web/head-large.jpg');
    expect(resolveAsset('/web/page.jpg', 'small')).toBe('/web/page-small.jpg');
  });

  test('passes vectors and unknown keys through unchanged', () => {
    expect(resolveAsset('/vector/logo/atreides.svg', 'large')).toBe('/vector/logo/atreides.svg');
    expect(resolveAsset('/web/logo.svg', 'large')).toBe('/web/logo.svg');
    expect(resolveAsset('/somewhere/else.txt', 'large')).toBe('/somewhere/else.txt');
  });
});
