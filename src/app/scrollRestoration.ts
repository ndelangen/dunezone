let hydrated = false;

/**
 * The router resets the window to the top after every render it has no saved position for, the hydrating one included.
 * Pages rendered on the server can be scrolled, or moved to a `#section` link, before hydration, and the router never saw that move.
 * So the hydrating render keeps any position the visitor already reached, and every later render scrolls as usual.
 */
export function restoresScroll(): boolean {
  if (typeof window === 'undefined' || hydrated) {
    return true;
  }
  hydrated = true;
  return window.scrollX === 0 && window.scrollY === 0;
}
