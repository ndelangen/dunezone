import { useEffect } from 'react';

/*
 * Marks <html data-dragging> while a sortable row's drag or a native drag lasts, so the theme hides tooltips for its length.
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
    /*
     * A drag whose source left the page mid-drag ends without a dragend reaching the document, so the first pointer
     * movement after it clears the mark too: no pointer event fires while a native drag lasts.
     */
    const events = ['dragend', 'drop', 'pointermove', 'pointerdown'] as const;
    document.addEventListener('dragstart', start, true);
    for (const event of events) {
      document.addEventListener(event, stop, true);
    }
    return () => {
      document.removeEventListener('dragstart', start, true);
      for (const event of events) {
        document.removeEventListener(event, stop, true);
      }
      stop();
    };
  }, []);
}
