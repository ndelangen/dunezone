import { expect, test } from 'vitest';

import { beaconMode, beaconRisen, beaconTarget, initialMotion, stepBeacon } from './beaconMotion';
import type { BeaconMode, BeaconMotion, BeaconSpot } from './beaconMotion';

const HOME: BeaconSpot = { x: 4, z: -2, ground: 0.2 };
const ANCHOR = [1, 0.18, 1];

function run(state: BeaconMotion, mode: BeaconMode, seconds: number, anchor = ANCHOR) {
  let frame = stepBeacon(state, { mode, target: beaconTarget(mode, HOME, { anchor }), delta: 0 });
  for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
    frame = stepBeacon(state, { mode, target: beaconTarget(mode, HOME, { anchor }), delta: 1 / 60 });
  }
  return frame;
}

test('a battle anchors the beacon whatever the phase; outside battles it only shows in the Battle phase', () => {
  expect(beaconMode({ inBattle: false, battle: true, pending: false, carrying: false })).toBe('anchor');
  expect(beaconMode({ inBattle: false, battle: false, pending: false, carrying: true })).toBe('gone');
  expect(beaconMode({ inBattle: true, battle: false, pending: true, carrying: true })).toBe('pending');
  expect(beaconMode({ inBattle: true, battle: false, pending: false, carrying: true })).toBe('carry');
  expect(beaconMode({ inBattle: true, battle: false, pending: false, carrying: false })).toBe('home');
});

test('the beacon heads for the point it is carried to, and home when nothing holds it', () => {
  expect(beaconTarget('carry', HOME, { carry: [2, 0.18, 3] })).toMatchObject({ x: 2, z: 3 });
  expect(beaconTarget('carry', HOME, { carry: null })).toBe(HOME);
  expect(beaconTarget('home', HOME, { anchor: ANCHOR })).toBe(HOME);
});

test('it rises through the table at the tracker and then stops asking for frames only while hidden', () => {
  const state = initialMotion(HOME);
  const rising = stepBeacon(state, { mode: 'home', target: HOME, delta: 1 / 60 });
  expect(rising.y).toBeLessThan(HOME.ground);
  expect(rising.animating).toBe(true);
  const risen = run(state, 'home', 3);
  expect(risen.y).toBeCloseTo(HOME.ground);
  expect(risen.visible).toBe(true);
});

test('landed on its battle, it lies flat, shrinks and fades out, then stops drawing', () => {
  const state = initialMotion(HOME);
  run(state, 'home', 3);
  const landed = run(state, 'anchor', 4);
  expect(state.flat).toBeGreaterThan(0.95);
  expect(state.fade).toBeLessThan(0.01);
  expect(landed.scale).toBeCloseTo(1, 1);
  expect(landed.visible).toBe(false);
  expect(landed.animating).toBe(false);
});

test('a finished battle brings the beacon back up at the tracker, unfaded', () => {
  const state = initialMotion(HOME);
  run(state, 'home', 3);
  run(state, 'anchor', 4);
  expect(stepBeacon(state, { mode: 'home', target: HOME, delta: 1 / 60 }).animating).toBe(true);
  const back = run(state, 'home', 4);
  expect(state).toMatchObject({ x: HOME.x, z: HOME.z, fade: 1, respawn: false });
  expect(back.visible).toBe(true);
});

test('leaving the Battle phase sinks the beacon back into the table', () => {
  const state = initialMotion(HOME);
  run(state, 'home', 3);
  const gone = run(state, 'gone', 3);
  expect(gone.visible).toBe(false);
  expect(gone.animating).toBe(false);
});

/* The table draws on demand: these runs step only while the beacon asks for another frame. */
function runOnDemand(state: BeaconMotion, mode: BeaconMode, motion: boolean, limit = 1000) {
  let frames = 0;
  let frame = stepBeacon(state, { mode, target: beaconTarget(mode, HOME, { anchor: ANCHOR }), delta: 1 / 60, motion });
  while (frame.animating && frames < limit) {
    frame = stepBeacon(state, { mode, target: beaconTarget(mode, HOME, { anchor: ANCHOR }), delta: 1 / 60, motion });
    frames += 1;
  }
  return { frame, frames };
}

test('after a faded battle ends, frames keep coming until the beacon has risen again at the tracker', () => {
  const state = initialMotion(HOME);
  run(state, 'home', 3);
  run(state, 'anchor', 4);
  const { frame } = runOnDemand(state, 'home', false);
  expect(state).toMatchObject({ x: HOME.x, z: HOME.z, respawn: false });
  expect(state.presence).toBe(1);
  expect(frame.visible).toBe(true);
});

test('with motion turned off a resting beacon stops asking for frames; with motion on it keeps pulsing', () => {
  const still = initialMotion(HOME);
  expect(runOnDemand(still, 'home', false).frames).toBeLessThan(1000);
  const pulsing = initialMotion(HOME);
  expect(runOnDemand(pulsing, 'home', true).frames).toBe(1000);
});

test('a table opened during a battle shows the beacon already landed and faded, not rising from the tracker', () => {
  const target = beaconTarget('anchor', HOME, { anchor: ANCHOR });
  const state = initialMotion(HOME, 'anchor', target);
  const frame = stepBeacon(state, { mode: 'anchor', target, delta: 1 / 60, motion: false });
  expect(state).toMatchObject({ x: 1, z: 1 });
  expect(frame.visible).toBe(false);
  expect(frame.animating).toBe(false);
});

test('the beacon can be picked up only once it has risen at the tracker', () => {
  const state = initialMotion(HOME);
  run(state, 'home', 0.5);
  expect(beaconRisen(state)).toBe(false);
  run(state, 'home', 2);
  expect(beaconRisen(state)).toBe(true);
  run(state, 'anchor', 4);
  stepBeacon(state, { mode: 'home', target: HOME, delta: 1 / 60 });
  expect(beaconRisen(state)).toBe(false);
});

test('a first frame with no elapsed time still asks for the next one, so the rise always starts', () => {
  const state = initialMotion(HOME);
  expect(stepBeacon(state, { mode: 'home', target: HOME, delta: 0 }).animating).toBe(true);
});

test('with motion turned off the beacon rises, lands and fades in a single frame', () => {
  const state = initialMotion(HOME);
  stepBeacon(state, { mode: 'home', target: HOME, delta: 1 / 60, motion: false });
  expect(beaconRisen(state)).toBe(true);
  const target = beaconTarget('anchor', HOME, { anchor: ANCHOR });
  stepBeacon(state, { mode: 'anchor', target, delta: 1 / 60, motion: false });
  const landed = stepBeacon(state, { mode: 'anchor', target, delta: 1 / 60, motion: false });
  expect(state).toMatchObject({ x: 1, z: 1 });
  expect(landed.visible).toBe(false);
});

test('a carried beacon sits exactly where a release would drop it', () => {
  const state = initialMotion(HOME);
  run(state, 'home', 3);
  const carry = beaconTarget('carry', HOME, { carry: [1, 0.18, -1] });
  stepBeacon(state, { mode: 'carry', target: carry, delta: 1 / 60 });
  expect(state).toMatchObject({ x: 1, z: -1 });
});
