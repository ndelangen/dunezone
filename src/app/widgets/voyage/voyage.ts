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
/* The latest departure; a caller hands back the token it was given, so an older departure's cleanup leaves a newer one alone. */
let current = 0;
/* Whether the latest departure is on its way into a table; a departing page that goes away before that calls it off. */
let opened = false;

/** Marks the document as departing for a table (AppBackground and AppRoot read it alongside any `data-voyage` element), and returns this departure's token. */
export function beginDeparture() {
  window.clearTimeout(release);
  riseEndsAt = performance.now() + RISE_MS;
  document.documentElement.dataset.voyage = 'departing';
  current += 1;
  opened = false;
  return current;
}

/**
 * The departure heads into its table, so the page that goes away next hands the planet on rather than calling it off.
 * Returns false for a departure a newer one has replaced, which must not navigate;
 * the default is the latest departure.
 */
export function openDeparture(token = current) {
  if (token !== current) {
    return false;
  }
  opened = true;
  return true;
}

/** The departing page went away: the table's frame should take over within a moment, else the mark lapses on its own. */
export function leaveDeparture(token: number) {
  if (token !== current || document.documentElement.dataset.voyage !== 'departing') {
    return;
  }
  /* A page left before its departure headed into a table (Back mid-way) calls it off, so no later table waits out its rise. */
  if (!opened) {
    cancelDeparture(token);
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
export function cancelDeparture(token: number) {
  if (token !== current) {
    return;
  }
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
