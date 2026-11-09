/*
 * Fetches and decodes a published image ahead of the `PublishedImage` that will draw it, an organ of `PublishedImage`.
 * The full capture is fetched, and marked decoded, so every `PublishedImage` of it on the page draws that copy from the browser's cache and appears at once.
 */

import { markDecoded } from './imageArrival';

/** An image that has not loaded by then counts as done, so one stalled request cannot hold whatever waits on it. */
const MOST_WAIT_MS = 10_000;

/** Every src asked for this page session; a failed one is dropped so a later call asks again. */
const loads = new Map<string, Promise<void>>();

function load(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      void img
        .decode()
        .catch(() => undefined)
        .then(() => {
          markDecoded(src);
          resolve();
        });
    };
    img.onerror = () => {
      loads.delete(src);
      resolve();
    };
    img.src = src;
  });
}

/**
 * Resolves once the image has loaded and decoded, failed, or taken too long.
 * It never rejects.
 * Asking again for an image already loaded or loading returns the same promise.
 */
export function preloadPublishedImage(src: string): Promise<void> {
  let loading = loads.get(src);
  if (!loading) {
    loading = load(src);
    loads.set(src, loading);
  }
  return Promise.race([loading, new Promise<void>((resolve) => setTimeout(resolve, MOST_WAIT_MS))]);
}

/** Preloads every image, telling `onProgress` how many are done after each one; resolves once all are. */
export async function preloadPublishedImages(
  srcs: readonly string[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const unique = [...new Set(srcs)];
  let done = 0;
  onProgress?.(0, unique.length);
  await Promise.all(
    unique.map((src) =>
      preloadPublishedImage(src).then(() => {
        done += 1;
        onProgress?.(done, unique.length);
      })
    )
  );
}
