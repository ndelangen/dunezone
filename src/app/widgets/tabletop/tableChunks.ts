/*
 * The game table's own lazy parts. The game page starts them with the table bundle,
 * so they need no second round trip after it renders. The authored board stays out: it brings
 * react-dom/server, and only a table with an authored board draws it.
 */
export const loadPieceBadge = () => import('./PieceBadge');
export const loadScenePresence = () => import('./ScenePresence');
export const loadScenePings = () => import('./ScenePings');
export const loadTabletopTools = () => import('./TabletopTools');
export const loadPlayCamera = () => import('./PlayCamera');
export const loadSpiceBank = () => import('./SpiceBank');

export function preloadTableChunks() {
  for (const load of [
    loadPieceBadge,
    loadScenePresence,
    loadScenePings,
    loadTabletopTools,
    loadPlayCamera,
    loadSpiceBank,
  ]) {
    /* A failure here is left to the table, whose own import of that part reports it. */
    load().catch(() => {});
  }
}
