import { useEffect } from 'react';

/*
 * Marks <html data-dragging> while any drag lasts, so the theme hides tooltips for its length.
 * Several drags may overlap (a row's drag and a native drag), so the mark stays until the last one ends.
 */
let drags = 0;

function begin(): () => void {
  drags += 1;
  document.documentElement.dataset.dragging = '';
  let ended = false;
  return () => {
    if (ended) {
      return;
    }
    ended = true;
    drags -= 1;
    if (drags === 0) {
      delete document.documentElement.dataset.dragging;
    }
  };
}

/** Marks the page as dragging for as long as `active` holds. */
export function useDragMark(active: boolean): void {
  useEffect(() => (active ? begin() : undefined), [active]);
}

/** Marks the page as dragging for every native drag (a hand card onto the table, say), from dragstart until it ends. */
export function useNativeDragMark(): void {
  useEffect(() => {
    let end: (() => void) | undefined;
    const start = () => {
      end?.();
      end = begin();
    };
    const stop = () => {
      end?.();
      end = undefined;
    };
    document.addEventListener('dragstart', start, true);
    document.addEventListener('dragend', stop, true);
    document.addEventListener('drop', stop, true);
    return () => {
      document.removeEventListener('dragstart', start, true);
      document.removeEventListener('dragend', stop, true);
      document.removeEventListener('drop', stop, true);
      stop();
    };
  }, []);
}
