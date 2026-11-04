/**
 * Stock artwork that is no longer offered: third-party game characters and marks (Command & Conquer: Nod and Red Alert).
 * The files stay published and their ids stay valid, so a saved faction, token or rulebook that already uses one still loads and draws it.
 * Pickers, the media catalogue and media search leave them out, so nobody can choose one again.
 */
const retiredPrefixes = [
  '/image/leader/nod/',
  '/image/leader/red-alert-1/',
  '/image/leader/red-alert-2/',
  '/image/leader/red-alert-3/',
];
const retiredPaths = new Set(['/vector/generic/nod.svg']);

export function isRetiredStockAsset(path: string) {
  return retiredPaths.has(path) || retiredPrefixes.some((prefix) => path.startsWith(prefix));
}
