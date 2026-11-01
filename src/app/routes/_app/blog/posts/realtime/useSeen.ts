import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/*
 * Whether a figure's entrance is waiting to play, whether the reader has reached it, and whether it is in view right now, so motion starts when they get there and rests while they are elsewhere.
 * A figure is `armed` only once scripts run, so the prerendered page and readers without scripts see it whole; reduced motion still reveals it, only without the transition.
 * `seen` latches on the first sight, for an entrance that plays once; `active` follows the figure in and out of view and the tab in and out of sight, for a loop that should not run unwatched.
 * The low threshold lets a figure taller than the screen count as reached once a little of it shows.
 */
export function useSeen(rootRef: RefObject<HTMLElement | null>) {
  const [state, setState] = useState<{ armed: boolean; seen: boolean; onScreen: boolean }>({
    armed: false,
    seen: false,
    onScreen: false,
  });
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden'
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      return;
    }
    setState({ armed: true, seen: false, onScreen: false });
    const observer = new IntersectionObserver(
      ([entry]) => {
        const onScreen = Boolean(entry?.isIntersecting);
        setState((previous) => ({ armed: true, seen: previous.seen || onScreen, onScreen }));
      },
      { threshold: 0.15 }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    const update = () => setTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return { armed: state.armed, seen: state.seen, active: state.onScreen && tabVisible };
}
