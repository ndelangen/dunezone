import { BOARD_SURFACE_Y } from '@shared/play/tableGeometry';

/* How far under the table the beacon waits before it rises, and where it sinks back to. */
const SUNK_DEPTH = 1.4;
export const HOME_HEIGHT = 0.6;
const CARRY_HEIGHT = 0.45;
/* The hovering beacon stands out over the tracker; once dropped it shrinks to a marker the size of a faction token. */
const HOVER_SCALE = 1.9;
const PLACED_SCALE = 1;
const RISE_SECONDS = 1.3;
/* A landed beacon has done its job once the battle shows; it fades out from this far into its landing. */
const LANDED = 0.95;
const MARK_Y = BOARD_SURFACE_Y + 0.004;

export type BeaconMode = 'gone' | 'home' | 'carry' | 'pending' | 'anchor';
export type BeaconSpot = { x: number; z: number; ground: number };
export type BeaconMotion = BeaconSpot & {
  presence: number;
  flat: number;
  height: number;
  fade: number;
  /* Set when the beacon must sink where it is and rise again at the tracker, after a battle ends. */
  respawn: boolean;
  last: BeaconMode;
};

/** What the beacon is doing, from the phase, the battle and the player's hand on it. */
export function beaconMode({
  inBattle,
  battle,
  pending,
  carrying,
}: {
  inBattle: boolean;
  battle: boolean;
  pending: boolean;
  carrying: boolean;
}): BeaconMode {
  if (battle) {
    return 'anchor';
  }
  if (!inBattle) {
    return 'gone';
  }
  if (pending) {
    return 'pending';
  }
  return carrying ? 'carry' : 'home';
}

/** Where the beacon is heading: the battle it marks, the point it was dropped or carried to, or its tracker disc. */
export function beaconTarget(
  mode: BeaconMode,
  home: BeaconSpot,
  points: { anchor?: readonly number[]; pending?: readonly number[] | null; carry?: readonly number[] | null }
): BeaconSpot {
  const point =
    mode === 'anchor' ? points.anchor : mode === 'pending' ? points.pending : mode === 'carry' ? points.carry : null;
  return point ? { x: point[0]!, z: point[2]!, ground: MARK_Y } : home;
}

export function restingMotion(home: BeaconSpot): BeaconMotion {
  return { ...home, presence: 0, flat: 0, height: HOME_HEIGHT, fade: 1, respawn: false, last: 'gone' };
}

const damp = (from: number, to: number, rate: number, delta: number) =>
  from + (to - from) * (1 - Math.exp(-rate * delta));
const easeOut = (value: number) => 1 - (1 - value) ** 3;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Moves the beacon one frame towards its target: it rises through the table and sinks back by `presence`, lies flat when dropped, and fades out once it has landed on its battle.
 * Leaving a battle sinks it where it stands, out of sight, then brings it back at the tracker.
 */
export function stepBeacon(state: BeaconMotion, mode: BeaconMode, target: BeaconSpot, rawDelta: number) {
  const delta = Math.min(rawDelta, 0.1);
  if (state.last === 'anchor' && mode !== 'anchor') {
    state.respawn = true;
  }
  state.last = mode;
  const present = mode !== 'gone' && !state.respawn;
  if (state.respawn && state.presence <= 0.001) {
    Object.assign(state, target, { flat: 0, height: HOME_HEIGHT, fade: 1, respawn: false });
  } else if (!state.respawn) {
    const rate = mode === 'carry' ? 22 : 7;
    state.x = damp(state.x, target.x, rate, delta);
    state.z = damp(state.z, target.z, rate, delta);
    state.ground = damp(state.ground, target.ground, rate, delta);
    state.flat = damp(state.flat, mode === 'anchor' || mode === 'pending' ? 1 : 0, 6, delta);
    state.height = damp(state.height, mode === 'carry' ? CARRY_HEIGHT : HOME_HEIGHT, 8, delta);
    state.fade = damp(state.fade, mode === 'anchor' && state.flat > LANDED ? 0 : 1, 4, delta);
  }
  state.presence = clamp01(state.presence + (present ? 1 : -1) * (delta / RISE_SECONDS));
  const visible = state.presence > 0.001 && state.fade > 0.01;
  return {
    y: state.ground - (1 - easeOut(state.presence)) * SUNK_DEPTH,
    scale: HOVER_SCALE + (PLACED_SCALE - HOVER_SCALE) * state.flat,
    visible,
    /* The table draws on demand; the beacon asks for frames while it shows, rises, or sinks out of sight. */
    animating: visible || (state.respawn && state.presence > 0.001) || (present && state.presence < 1),
  };
}
