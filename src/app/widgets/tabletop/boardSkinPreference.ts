import { BOARD_SKINS } from './boardSkins';
import type { BoardSkin } from './boardSkins';
import { viewerChoice } from './viewerPreference';

/*
 * How this viewer's board looks: its skin and whether it is shaded like a planet.
 * Both are kept per browser beside table lighting and pan speed and never sent to the game:
 * every player sees the same pieces on the same territories, each through their own look.
 */
const skin = viewerChoice<BoardSkin>('dunezone-board-skin', {
  parse: (stored) => ((BOARD_SKINS as readonly string[]).includes(stored ?? '') ? (stored as BoardSkin) : 'none'),
  serialize: (value) => value,
  fallback: 'none',
});
const planet = viewerChoice<boolean>('dunezone-planet-shading', {
  parse: (stored) => stored === 'on',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: false,
});

export const setBoardSkin = skin.set;
/** This viewer's board skin. */
export const useBoardSkin = skin.use;

export const setPlanetShading = planet.set;
/** Whether this viewer shades the board like a lit planet. */
export const usePlanetShading = planet.use;
