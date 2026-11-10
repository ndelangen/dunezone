// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { decodedFrom } from './imageArrival';
import { preloadPublishedImages } from './preloadPublishedImage';

/* jsdom fetches no images, so every one loads as soon as it is given its src. */
const requested: string[] = [];

class LoadingImage {
  decoding = 'auto';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode() {
    return Promise.resolve();
  }
  set src(value: string) {
    requested.push(value);
    queueMicrotask(() => this.onload?.());
  }
}

beforeEach(() => {
  requested.length = 0;
  vi.stubGlobal('Image', LoadingImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('each picture fetches the copies it is drawn from, and counts once all of them are in', async () => {
  const progress: [number, number][] = [];
  await preloadPublishedImages(
    ['/a.jpg', '/b.jpg', '/a.jpg'],
    (done, total) => progress.push([done, total]),
    (src) => [`${src}?w=160`, `${src}?w=640`]
  );
  expect(requested.sort()).toEqual(['/a.jpg?w=160', '/a.jpg?w=640', '/b.jpg?w=160', '/b.jpg?w=640']);
  expect(progress).toEqual([
    [0, 2],
    [1, 2],
    [2, 2],
  ]);
  expect(decodedFrom('/a.jpg?w=640')).toBe('/a.jpg?w=640');
});

test('without copies a picture fetches itself', async () => {
  await preloadPublishedImages(['/c.jpg']);
  expect(requested).toEqual(['/c.jpg']);
});
