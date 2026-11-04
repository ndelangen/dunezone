import { viewerChoice } from './viewerPreference';

/*
 * Whether the camera moves to each phase's own view when the phase begins, a per-browser choice that never reaches the game.
 * On by default; a player who sets up their own view can keep it across phases from the game menu (#2669).
 */
const followsPhase = viewerChoice<boolean>('dunezone-camera-follows-phase', {
  parse: (stored) => stored !== 'off',
  serialize: (on) => (on ? 'on' : 'off'),
  fallback: true,
});

export const setCameraFollowsPhase = followsPhase.set;
/** The current choice, outside React. */
export const readCameraFollowsPhase = followsPhase.read;
/** Whether this viewer's camera moves to each phase's view when the phase begins. */
export const useCameraFollowsPhase = followsPhase.use;
