/*
 * A page departing for a table marks the whole document, not just its own subtree, so the mark survives the route change.
 * Between the departing page unmounting and the table's waiting frame mounting, nothing else is marked `data-voyage`, and the
 * rising planet would retarget home mid-flight and restart; the root mark holds the planet's course across that gap.
 */
const LANDING_GRACE_MS = 1500;
let release: number | undefined;

/** Marks the document as departing for a table (AppBackground and AppRoot read it alongside any `data-voyage` element). */
export function beginDeparture() {
  window.clearTimeout(release);
  document.documentElement.dataset.voyage = 'departing';
}

/** The departing page went away: the table's frame should take over within a moment, else the mark lapses on its own. */
export function leaveDeparture() {
  if (document.documentElement.dataset.voyage !== 'departing') {
    return;
  }
  window.clearTimeout(release);
  release = window.setTimeout(endDeparture, LANDING_GRACE_MS);
}

/** Clears the departure mark: a table's frame has taken over, or the departure was called off. */
export function endDeparture() {
  window.clearTimeout(release);
  if (document.documentElement.dataset.voyage === 'departing') {
    delete document.documentElement.dataset.voyage;
  }
}
