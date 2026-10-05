/*
 * Artwork loads the table has started and not yet settled, counted across the page.
 * A load settles when its first attempt has delivered its artwork or failed, or when its owner disposes it.
 * The browser verification waits for none before it acts on a newly opened table, because parsing that artwork and drawing it kept a tab's main thread busy for seconds after its first frame (#1592).
 */
let unsettled = 0;
const listeners = new Set<() => void>();

/** Wakes a waiting scene when its artwork load count changes. */
export function subscribeArtworkLoads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Counts one artwork load until the returned function is called; later calls do nothing. */
export function startArtworkLoad(): () => void {
  unsettled += 1;
  for (const notify of listeners) {
    notify();
  }
  let settled = false;
  return () => {
    if (!settled) {
      settled = true;
      unsettled -= 1;
      for (const notify of listeners) {
        notify();
      }
    }
  };
}

/** How many artwork loads have not settled. */
export function unsettledArtworkLoads(): number {
  return unsettled;
}
