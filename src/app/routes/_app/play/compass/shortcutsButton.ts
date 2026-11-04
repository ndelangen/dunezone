import { viewerChoice } from '../../../../widgets/tabletop/viewerPreference';

/*
 * Whether the bar at the bottom of the table shows the keyboard shortcuts button beside the viewer's token.
 * On until the viewer turns it off in the game menu; it stays in this browser and never reaches the game.
 * ? and the compass's search still open the cheat sheet without it.
 */
const button = viewerChoice<boolean>('dunezone-shortcuts-button', {
  parse: (stored) => stored !== 'off',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: true,
});

export const setShortcutsButton = button.set;
/** Whether this viewer keeps the keyboard shortcuts button in the bar. */
export const useShortcutsButton = button.use;
