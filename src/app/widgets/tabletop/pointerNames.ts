import { viewerChoice } from './viewerPreference';

/*
 * Whether other players' pointer hands carry their names, a per-browser choice that never reaches the game.
 * On by default; a player who finds the names busy can turn them off from the game menu (#2993).
 */
const pointerNames = viewerChoice<boolean>('dunezone-pointer-names', {
  parse: (stored) => stored !== 'off',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: true,
});

export const setPointerNames = pointerNames.set;
/** Whether this viewer's table shows the names beside pointer hands. */
export const usePointerNames = pointerNames.use;
