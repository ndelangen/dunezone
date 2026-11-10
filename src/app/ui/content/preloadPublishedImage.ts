/*
 * Fetches and decodes published images ahead of the `PublishedImage` that will draw them, for a page that wants every picture in before it goes on, such as a tool's deck before its game starts.
 * The full capture is fetched, and marked decoded, so every `PublishedImage` of it on the page draws that copy from the browser's cache and appears at once.
 */

import { useEffect, useState } from 'react';

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
 * Resolves once the image has loaded and decoded, failed, or taken too long;
 * it never rejects.
 * Asking again for an image already loaded or loading returns the same promise.
 */
export function preloadPublishedImage(src: string): Promise<void> {
  let loading = loads.get(src);
  if (!loading) {
    loading = load(src);
    loads.set(src, loading);
  }
  /* The wait is cleared once the image settles, so an image already in leaves no timer behind. */
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, MOST_WAIT_MS);
  });
  return Promise.race([loading, waited]).finally(() => clearTimeout(timer));
}

/** Each picture as the one URL it is drawn from. */
const itself = (src: string): readonly string[] => [src];

/**
 * Preloads every picture, telling `onProgress` how many are done after each one;
 * resolves once all are.
 * `copies` names the URLs a picture is drawn from, such as resized copies, and a picture is done once all of them are.
 */
export async function preloadPublishedImages(
  srcs: readonly string[],
  onProgress?: (done: number, total: number) => void,
  copies: (src: string) => readonly string[] = itself
): Promise<void> {
  const unique = [...new Set(srcs)];
  let done = 0;
  onProgress?.(0, unique.length);
  await Promise.all(
    unique.map((src) =>
      Promise.all(copies(src).map(preloadPublishedImage)).then(() => {
        done += 1;
        onProgress?.(done, unique.length);
      })
    )
  );
}

/**
 * Preloads every picture while the caller is mounted, and counts them in: `done` of `total`, and `ready` once all are.
 * A new list starts the count again;
 * pictures already in count at once.
 * `copies` is as `preloadPublishedImages` takes it, and should be a function defined once rather than on every render.
 */
export function usePreloadedImages(srcs: readonly string[], copies: (src: string) => readonly string[] = itself) {
  const key = [...new Set(srcs)].join('\n');
  const [progress, setProgress] = useState({ key, done: 0, total: new Set(srcs).size });
  useEffect(() => {
    let live = true;
    void preloadPublishedImages(
      key ? key.split('\n') : [],
      (done, total) => {
        if (live) {
          setProgress({ key, done, total });
        }
      },
      copies
    );
    return () => {
      live = false;
    };
  }, [copies, key]);
  const current = progress.key === key ? progress : { key, done: 0, total: key ? key.split('\n').length : 0 };
  return { done: current.done, total: current.total, ready: current.done >= current.total };
}
