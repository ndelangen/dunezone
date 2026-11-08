import { useEffect } from 'react';

/*
 * Marks <html data-dragging> while a drag lasts (a sortable row's, which a hand piece dragged onto the table is too),
 * so the theme hides tooltips for its length. Several drags may overlap, so the mark stays until the last one ends.
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
