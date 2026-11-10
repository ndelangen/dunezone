/**
 * Reloads a tab whose bundle a deploy replaced, once.
 *
 * A deploy publishes only the new release's chunks (#2782), and a chunk the server no longer has answers an uncached 404 (#2708).
 * So a tab opened before the deploy fails on its next lazy import: the route or widget it reaches for is gone.
 * Vite reports every such failure, the import itself and the CSS and JavaScript it preloads, as a cancelable `vite:preloadError` on `window`, and the fix is the one Vite's docs give: load the page again, which fetches the new release's HTML and chunks.
 *
 * The guard is the part that needs care.
 * A reload that fails the same way would reload again forever, so a second reload inside {@link RELOAD_GUARD_MS} of the last is refused, and then the failure reaches the route's error component, which offers the Refresh button (`isStaleClientData`).
 * The timestamp lives in `sessionStorage`, so it survives the reload and stays per tab;
 * where storage is blocked, the guard cannot hold, so the tab does not reload at all.
 */

/** The `sessionStorage` key holding when this tab last reloaded for a stale bundle. */
export const RELOAD_KEY = 'dunezone:stale-bundle-reload';

/** Long enough for a reload to fetch and run the new release's entry, short enough that a later deploy in the same tab still reloads. */
export const RELOAD_GUARD_MS = 30_000;

/**
 * Reloads the page unless this tab already did so within the guard window, or is offline, where a reload shows the browser's error page instead.
 * Returns whether it reloaded.
 */
export function reloadForStaleBundle(now: number = Date.now()): boolean {
  if (navigator.onLine === false) {
    return false;
  }
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY));
    if (Number.isFinite(last) && now - last >= 0 && now - last < RELOAD_GUARD_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Listens for Vite's chunk-load failures and reloads for them.
 * The event is left uncanceled, so the import still rejects: canceling would resolve it to `undefined`, and the caller would crash on that instead while the reload is under way.
 */
export function installStaleBundleReload(target: Pick<Window, 'addEventListener'> = window): void {
  target.addEventListener('vite:preloadError', () => {
    reloadForStaleBundle();
  });
}
