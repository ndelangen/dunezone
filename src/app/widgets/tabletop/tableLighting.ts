import { viewerPreference } from './viewerPreference';

/*
 * How bright this viewer wants the table lights, a per-browser preference that never reaches the game.
 * 1 is the table's own lighting; the slider in the game menu scales it between the bounds below.
 */

export const TABLE_LIGHTING_MIN = 0.4;
export const TABLE_LIGHTING_MAX = 1.4;

const lighting = viewerPreference('dunezone-table-lighting', {
  min: TABLE_LIGHTING_MIN,
  max: TABLE_LIGHTING_MAX,
  fallback: 1,
});

export const setTableLighting = lighting.set;

/** The viewer's table lighting, from TABLE_LIGHTING_MIN to TABLE_LIGHTING_MAX. */
export const useTableLighting = lighting.use;
