import { useEffect, useState, useSyncExternalStore } from 'react';
import type { RefObject } from 'react';

/*
 * The two questions a moving figure asks before it moves: did the reader ask for stillness, and are they looking.
 * Both are kept here rather than borrowed from another post's figures, so each post's folder stays its own organ.
 * The server and a browser without the media-query API answer "no" to reduced motion, so the prerendered page matches a browser that welcomes motion.
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

/**
 * Whether scripts run (`armed`) and the figure is on screen in a visible tab (`active`), so a loop never runs unwatched.
 * Until scripts run the figure is not armed, so the prerendered page and a reader without scripts see its resting state.
 */
export function useInView(rootRef: RefObject<HTMLElement | null>) {
  const [armed, setArmed] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return;
    }
    setArmed(true);
    const observer = new IntersectionObserver(([entry]) => setOnScreen(Boolean(entry?.isIntersecting)), {
      threshold: 0.2,
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const update = () => setTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return { armed, active: onScreen && tabVisible };
}
