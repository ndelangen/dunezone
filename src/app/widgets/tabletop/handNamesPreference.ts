import { viewerChoice } from './viewerPreference';

/*
 * Whether other players' pointer hands carry their names, a per-browser choice that never reaches the game.
 * On by default; a player who finds the names in the way can hide them from the game menu.
 */
const handNames = viewerChoice<boolean>('dunezone-hand-names', {
  parse: (stored) => stored !== 'off',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: true,
});

export const setHandNames = handNames.set;
/** Whether this viewer sees names beside other players' pointer hands. */
export const useHandNames = handNames.use;
