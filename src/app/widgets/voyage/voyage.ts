/*
 * A page departing for a table marks the whole document, not just its own subtree, so the mark survives the route change.
 * Between the departing page unmounting and the table's waiting frame mounting, nothing else is marked `data-voyage`, and the
 * rising planet would retarget home mid-flight and restart; the root mark holds the planet's course across that gap.
 */
const LANDING_GRACE_MS = 1500;
let release: number | undefined;
/* The planet's rise takes as long as AppBackground's transform transition. */
const RISE_MS = 1600;
let riseEndsAt = Number.NEGATIVE_INFINITY;

/** Marks the document as departing for a table (AppBackground and AppRoot read it alongside any `data-voyage` element). */
export function beginDeparture() {
  window.clearTimeout(release);
  riseEndsAt = performance.now() + RISE_MS;
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

/** Clears the departure mark: a table's frame has taken over. */
export function endDeparture() {
  window.clearTimeout(release);
  if (document.documentElement.dataset.voyage === 'departing') {
    delete document.documentElement.dataset.voyage;
  }
}

/** Calls the departure off: the mark goes, and so does the rise a table would otherwise wait out before building. */
export function cancelDeparture() {
  riseEndsAt = Number.NEGATIVE_INFINITY;
  endDeparture();
}

/*
 * A table reached without a departure (a direct link, a reload) shows the planet already at rest in the centre, fading in
 * rather than rising: the frame mounts with the planet's transition off, and the transition comes back once the fade is done.
 */
const DIRECT_ARRIVAL_MS = 800;

export function arriveDirectly() {
  const root = document.documentElement;
  root.dataset.voyageArrival = 'direct';
  window.setTimeout(() => {
    delete root.dataset.voyageArrival;
  }, DIRECT_ARRIVAL_MS);
}

/** How long the planet's rise still runs, so a table can hold its first build until the planet is at rest. */
export function riseRemaining() {
  return Math.max(0, riseEndsAt - performance.now());
}
