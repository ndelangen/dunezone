import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** Whether a figure has been on screen, so its motion starts when the reader gets there rather than on page load. */
export function useSeen(rootRef: RefObject<HTMLElement | null>, threshold = 0.6) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef, threshold]);
  return seen;
}
