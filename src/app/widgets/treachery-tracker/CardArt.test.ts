// @vitest-environment jsdom

import { publishedHref } from '@shared/asset-publishing/publicationTargets';
import { afterEach, expect, test } from 'vite-plus/test';

import { faceAt, faceCopies } from './CardArt';

const face = publishedHref('card-treachery', 'j57a3k2m9q8w7e6r5t4y3u2i1o0p9a8s', '2026-11-10T00:00:00.000Z');

/* Every width the tracker draws a face at, in CSS pixels: the glyph crops, the auction card and the three whole-card views. */
const DRAWN_WIDTHS = [22 * 1.714, 28 * 1.714, 36 * 1.714, 48 * 1.714, 24 * 6.43, 80, 160, 180, 240];

afterEach(() => {
  window.devicePixelRatio = 1;
});

test.each([1, 2, 3])('at a device pixel ratio of %i, everything drawn comes from a copy the setup fetches', (ratio) => {
  window.devicePixelRatio = ratio;
  const fetched = faceCopies(face);
  for (const width of DRAWN_WIDTHS) {
    expect(fetched).toContain(faceAt(face, width));
  }
  expect(fetched.length).toBeLessThanOrEqual(2);
});

test('a glyph draws from a resized copy, never the full capture', () => {
  window.devicePixelRatio = 2;
  expect(faceAt(face, 36 * 1.714)).toMatch(/[?&]w=\d+/);
});
