import type { ParsedLocation } from '@tanstack/react-router';

let firstClientRenderDone = false;

/**
 * The router resets the window to the top after every render it has no saved position for, the first client render included.
 * Pages rendered on the server can be scrolled, or moved to a `#section` link, before that render, and the router never saw that move.
 * So the first client render of a fresh visit keeps any position the visitor already reached, and every later render scrolls as usual.
 * A reload or a back or forward visit still lets the router restore its saved position, and a location with a hash still scrolls to its section.
 * Scrolling before the router's own inline restore script runs is still reset by that script.
 */
export function restoresScroll({ location }: { location: Pick<ParsedLocation, 'hash'> }): boolean {
  if (typeof window === 'undefined' || firstClientRenderDone) {
    return true;
  }
  firstClientRenderDone = true;
  if (location.hash || !freshVisit()) {
    return true;
  }
  return window.scrollX === 0 && window.scrollY === 0;
}

function freshVisit(): boolean {
  const [entry] = performance.getEntriesByType?.('navigation') ?? [];
  return !entry || (entry as PerformanceNavigationTiming).type === 'navigate';
}
