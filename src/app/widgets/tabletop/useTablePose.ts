import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useLayoutEffect, useRef } from 'react';
import type { Group } from 'three';
import { Vector3 } from 'three';

type TablePose = { position: Vector3; orientation: number };
type PoseSmoothing = { active: boolean; wasRemote: boolean };

function retargetPoseSmoothing(smoothing: PoseSmoothing, remote: boolean, immediate: boolean) {
  smoothing.active = !immediate && (remote || smoothing.wasRemote || smoothing.active);
  smoothing.wasRemote = remote;
}

function snapTablePose(group: Group, target: TablePose) {
  group.position.copy(target.position);
  group.rotation.y = target.orientation;
}

/* A frame counts for its real length up to this cap, so a pose settles in about 0.2 s down to 4 fps.
   One 0.25 s frame already covers 99.75% of the gap, so the cap no longer changes what a player sees.
   The scheduler's `computeRootDelta`, not this cap, limits the first frame after an idle table. */
const POSE_SMOOTHING_MAX_FRAME_SECONDS = 0.25;

function advanceTablePose(group: Group, target: TablePose, delta: number): boolean {
  const rotationDelta = Math.atan2(
    Math.sin(target.orientation - group.rotation.y),
    Math.cos(target.orientation - group.rotation.y)
  );
  const settled = group.position.distanceToSquared(target.position) < 0.000001 && Math.abs(rotationDelta) < 0.001;
  if (settled) {
    snapTablePose(group, target);
    return false;
  }
  const amount = 1 - Math.exp(-24 * Math.min(delta, POSE_SMOOTHING_MAX_FRAME_SECONDS));
  group.position.lerp(target.position, amount);
  group.rotation.y += rotationDelta * amount;
  return true;
}

export function useTablePose(position: Vector3Tuple, orientation: number, remote: boolean, immediate = false) {
  const [positionX, positionY, positionZ] = position;
  const groupRef = useRef<Group>(null);
  const target = useRef({ position: new Vector3(...position), orientation });
  const initialized = useRef(false);
  const smoothing = useRef<PoseSmoothing>({ active: false, wasRemote: false });
  const invalidate = useThree((state) => state.invalidate);
  useLayoutEffect(() => {
    target.current.position.set(positionX, positionY, positionZ);
    target.current.orientation = orientation;
    retargetPoseSmoothing(smoothing.current, remote, immediate);
    const group = groupRef.current;
    const shouldSnap = !initialized.current || !smoothing.current.active;
    if (group && shouldSnap) {
      snapTablePose(group, target.current);
      initialized.current = true;
    }
    invalidate();
  }, [immediate, invalidate, orientation, positionX, positionY, positionZ, remote]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || !smoothing.current.active) {
      return;
    }
    smoothing.current.active = advanceTablePose(group, target.current, delta);
    if (smoothing.current.active) {
      invalidate();
    }
  });
  return groupRef;
}
