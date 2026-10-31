import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/*
 * Whether a figure's entrance is waiting to play, and whether the reader has reached it, so motion starts when they get there rather than on page load.
 * A figure is `armed` only once scripts run, so the prerendered page and readers without scripts see it whole; reduced motion still reveals it, only without the transition.
 * The low threshold lets a figure taller than the screen count as reached once a little of it shows.
 */
export function useSeen(rootRef: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<{ armed: boolean; seen: boolean }>({ armed: false, seen: false });
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return;
    }
    setState({ armed: true, seen: false });
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setState({ armed: true, seen: true });
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);
  return state;
}
