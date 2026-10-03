import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';

const BIDDER_TURN_MS = 450;

type Turn = { from: number; to: number; startedAt: number };

/* The shape points along +x, so turning it by -angle about y points it at the Seat at `angle`; the turn takes the shorter way. */
function turnToward(from: number, angle: number): Turn {
  const to = -angle;
  return { from, to: from + Math.atan2(Math.sin(to - from), Math.cos(to - from)), startedAt: performance.now() };
}

/** Eases the bidder's turn: the rotation at `now`, or null once the turn is done. */
function turnedAt(turn: Turn, now: number) {
  const linear = Math.min(1, (now - turn.startedAt) / BIDDER_TURN_MS);
  const eased = linear * linear * (3 - 2 * linear);
  return { rotation: turn.from + (turn.to - turn.from) * eased, done: linear >= 1 };
}

/** Turns the bidder's group toward the Seat at `target`: at once on first draw, smoothly after that. */
export function useBidderRotation(target: number | null) {
  const groupRef = useRef<Group>(null);
  const turn = useRef<Turn | null>(null);
  const shown = useRef<number | null>(null);
  const invalidate = useThree((state) => state.invalidate);
  useFrame(() => {
    const group = groupRef.current;
    const active = turn.current;
    if (!group || !active) {
      return;
    }
    const { rotation, done } = turnedAt(active, performance.now());
    group.rotation.y = rotation;
    if (done) {
      turn.current = null;
      return;
    }
    invalidate();
  });
  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || target === shown.current) {
      return;
    }
    if (target === null) {
      return;
    }
    if (shown.current === null) {
      group.rotation.y = -target;
    } else {
      turn.current = turnToward(group.rotation.y, target);
    }
    shown.current = target;
    invalidate();
  }, [invalidate, target]);
  return groupRef;
}
