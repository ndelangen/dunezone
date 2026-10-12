import { viewerPreference } from './viewerPreference';

/*
 * How fast this viewer wants the pan keys to slide a close look, a per-browser preference that never reaches the game.
 * 1 is the table's own speed; the slider in the game menu scales it from a fifth to five times as fast (Norbert, 2026-10-12).
 */

export const TABLE_PAN_SPEED_MIN = 0.2;
export const TABLE_PAN_SPEED_MAX = 5;

const panSpeed = viewerPreference('dunezone-table-pan-speed', {
  min: TABLE_PAN_SPEED_MIN,
  max: TABLE_PAN_SPEED_MAX,
  fallback: 1,
});

export const setTablePanSpeed = panSpeed.set;

/** The viewer's pan speed for the frame loop, which reads it every frame instead of re-rendering on a change. */
export const readTablePanSpeed = panSpeed.read;

/** The viewer's pan speed, from TABLE_PAN_SPEED_MIN to TABLE_PAN_SPEED_MAX. */
export const useTablePanSpeed = panSpeed.use;
