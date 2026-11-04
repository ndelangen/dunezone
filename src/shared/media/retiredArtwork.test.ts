import { expect, test } from 'vite-plus/test';

import { isRetiredArtwork, originalArtwork } from './retiredArtwork';

test('a retired duplicate resolves to the artwork it copies', () => {
  expect(isRetiredArtwork('/vector/decal/barge.svg')).toBe(true);
  expect(originalArtwork('/vector/decal/barge.svg')).toBe('/vector/generic/mantis-cruiser.svg');
  expect(originalArtwork('/image/texture/058.jpg')).toBe('/image/texture/059.jpg');
});

test('live artwork stands for itself', () => {
  expect(isRetiredArtwork('/vector/generic/mantis-cruiser.svg')).toBe(false);
  expect(originalArtwork('/image/texture/059.jpg')).toBe('/image/texture/059.jpg');
});
