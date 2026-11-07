/*
 * The game table's own lazy parts. The game page starts them with the table bundle,
 * so they need no second round trip after it renders. The authored board is among them: the
 * table's opening waits for its paint, so its chunk (which brings react-dom/server) must not start late.
 */
export const loadAuthoredBoard = () => import('./AuthoredBoard');
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
    loadAuthoredBoard,
  ]) {
    /* A failure here is left to the table, whose own import of that part reports it. */
    load().catch(() => {});
  }
}
