import { useSyncExternalStore } from 'react';

/*
 * Whether the reader asked their system for less motion, for the figures whose motion is driven by script rather than a stylesheet.
 * The stylesheet half of each figure answers the same media query on its own; this is for the timers and frame loops, which a media query cannot stop.
 * The server and a browser without the media-query API answer "no", so the prerendered page matches a browser that welcomes motion.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(listener: () => void): () => void {
  if (typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

function read(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}
