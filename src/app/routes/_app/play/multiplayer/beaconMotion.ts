import { BOARD_SURFACE_Y } from '@shared/play/tableGeometry';

/* How far under the table the beacon waits before it rises, and where it sinks back to. */
const SUNK_DEPTH = 1.4;
export const HOME_HEIGHT = 0.6;
const CARRY_HEIGHT = 0.45;
/* The hovering beacon stands out over the tracker; once dropped it shrinks to a marker the size of a faction token. */
const HOVER_SCALE = 1.9;
const PLACED_SCALE = 1;
const RISE_SECONDS = 1.3;
/* A frame long enough for every transition to finish, standing in for elapsed time when motion is turned off. */
const SETTLE_AT_ONCE = 10;
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
  const point = mode === 'anchor' || mode === 'pending' || mode === 'carry' ? points[mode] : null;
  return point ? { x: point[0]!, z: point[2]!, ground: MARK_Y } : home;
}

/** Where the beacon starts: under the table at its tracker, or already landed and faded when a battle is under way. */
export function initialMotion(home: BeaconSpot, mode: BeaconMode = 'gone', target: BeaconSpot = home): BeaconMotion {
  if (mode === 'anchor') {
    return { ...target, presence: 1, flat: 1, height: HOME_HEIGHT, fade: 0, respawn: false, last: 'anchor' };
  }
  return { ...home, presence: 0, flat: 0, height: HOME_HEIGHT, fade: 1, respawn: false, last: 'gone' };
}

/** Up at its tracker and ready to be picked up: risen all the way and not on its way back from a battle. */
export const beaconRisen = (state: BeaconMotion) => state.presence >= 1 && !state.respawn;

const damp = (from: number, to: number, rate: number, delta: number) =>
  from + (to - from) * (1 - Math.exp(-rate * delta));
const easeOut = (value: number) => 1 - (1 - value) ** 3;
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/* Where each part of the beacon's pose is heading in this mode. */
function goalsOf(state: BeaconMotion, mode: BeaconMode, present: boolean) {
  return {
    presence: present ? 1 : 0,
    flat: mode === 'anchor' || mode === 'pending' ? 1 : 0,
    height: mode === 'carry' ? CARRY_HEIGHT : HOME_HEIGHT,
    fade: mode === 'anchor' && state.flat > LANDED ? 0 : 1,
  };
}

/* While the beacon is on its way, it eases towards its target, lies flat once dropped, and fades out once landed on its battle. */
function follow(state: BeaconMotion, mode: BeaconMode, target: BeaconSpot, delta: number) {
  /* A carried beacon sits exactly on the point a release would drop it on. */
  const glide = mode === 'carry' ? 1 : 1 - Math.exp(-7 * delta);
  const goals = goalsOf(state, mode, true);
  state.x += (target.x - state.x) * glide;
  state.z += (target.z - state.z) * glide;
  state.ground += (target.ground - state.ground) * glide;
  state.flat = damp(state.flat, goals.flat, 6, delta);
  state.height = damp(state.height, goals.height, 8, delta);
  state.fade = damp(state.fade, goals.fade, 4, delta);
}

/* How far the beacon still is from where it is heading, so a beacon at rest stops asking for frames. */
function distanceToRest(state: BeaconMotion, mode: BeaconMode, target: BeaconSpot, present: boolean) {
  const goals = goalsOf(state, mode, present);
  const off = [
    state.x - target.x,
    state.z - target.z,
    state.ground - target.ground,
    state.presence - goals.presence,
    state.flat - goals.flat,
    state.height - goals.height,
    state.fade - goals.fade,
  ];
  return Math.max(...off.map(Math.abs));
}

function frameOf(state: BeaconMotion, unsettled: boolean, motion: boolean) {
  const visible = state.presence > 0.001 && state.fade > 0.01;
  return {
    y: state.ground - (1 - easeOut(state.presence)) * SUNK_DEPTH,
    scale: HOVER_SCALE + (PLACED_SCALE - HOVER_SCALE) * state.flat,
    visible,
    /*
     * The table draws on demand, so the beacon asks for the next frame until it comes to rest, sinking out of sight
     * and rising back included; with motion allowed a visible beacon also keeps its pulse going.
     */
    animating: (motion && visible) || unsettled,
  };
}

/* A beacon leaving its battle sinks where it stands, and once out of sight jumps home to rise there. */
function advance(state: BeaconMotion, mode: BeaconMode, target: BeaconSpot, delta: number) {
  state.respawn ||= state.last === 'anchor' && mode !== 'anchor';
  state.last = mode;
  if (!state.respawn) {
    follow(state, mode, target, delta);
  } else if (state.presence <= 0.001) {
    Object.assign(state, target, { flat: 0, height: HOME_HEIGHT, fade: 1, respawn: false });
  }
}

/* Out of sight, only presence matters: a sunk beacon need not finish sliding or fading. */
function unsettled(state: BeaconMotion, mode: BeaconMode, target: BeaconSpot, present: boolean) {
  if (state.respawn) {
    return true;
  }
  const hidden = state.presence <= 0 && !present;
  return !hidden && distanceToRest(state, mode, target, present) > 1e-3;
}

type Step = { mode: BeaconMode; target: BeaconSpot; delta: number; motion?: boolean };

/**
 * Moves the beacon one frame towards its target: it rises through the table and sinks back by `presence`, lies flat when dropped, and fades out once it has landed on its battle.
 * Leaving a battle sinks it where it stands, out of sight, then brings it back at the tracker.
 */
export function stepBeacon(state: BeaconMotion, { mode, target, delta: rawDelta, motion = true }: Step) {
  /* With motion turned off every transition lands in one frame; only the carry still moves with the pointer. */
  /* A slow machine draws few frames, so a long frame still counts for most of its time and the beacon keeps its pace. */
  const delta = motion ? Math.min(rawDelta, 0.5) : SETTLE_AT_ONCE;
  advance(state, mode, target, delta);
  const present = mode !== 'gone' && !state.respawn;
  state.presence = clamp01(state.presence + (present ? 1 : -1) * (delta / RISE_SECONDS));
  return frameOf(state, unsettled(state, mode, target, present), motion);
}
