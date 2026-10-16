import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { createContext, createElement, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
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

/*
 * A piece riding a plate someone else carries is posed from the plate as shown, not smoothed on its own:
 * smoothing each rider separately would cut straight across the plate's arc as it turns.
 * Nothing about a ride is kept: every frame, a rider takes its place from where its plate is shown, and once the ride ends it glides on from there to its own place.
 * A plate in this page's own hand carries its riders the same way, so they keep up with it however it is set down.
 * A ride that ends where the plate is set down at once, as this page's own hand does, ends at once for the riders too.
 */
type PoseNode = { group: { current: Group | null }; target: TablePose };
/* `rodeOn` is the plate a rider followed in the last frame it rode, so the frame its ride ends can tell whether the plate still moves. */
type PoseState = PoseNode & { smoothing: PoseSmoothing; rodeOn?: PoseState };

/* Plates move before the pieces on them in every frame, so a rider is placed from where its plate is shown in that frame. */
const PLATE_FRAME_PRIORITY = 1;

const PlatePosesContext = createContext<Map<string, PoseState> | null>(null);

/** The scene's plates as they are shown, by id, so the pieces riding one can take their places from it. */
export function PlatePosesProvider({ children }: { children: ReactNode }) {
  const plates = useMemo(() => new Map<string, PoseState>(), []);
  return createElement(PlatePosesContext.Provider, { value: plates }, children);
}

/*
 * A rider placed where its target sits on the plate's target, carried to where the plate is shown.
 * A plate the scene does not draw, such as one in a battle, shows nothing to follow, so the rider stands at its own target.
 */
function placeRider(rider: PoseNode, plate: PoseNode | undefined) {
  const group = rider.group.current;
  if (!group) {
    return;
  }
  const shown = plate?.group.current;
  if (!shown || !plate) {
    snapTablePose(group, rider.target);
    return;
  }
  const turn = shown.rotation.y - plate.target.orientation;
  const x = rider.target.position.x - plate.target.position.x;
  const z = rider.target.position.z - plate.target.position.z;
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  group.position.set(
    shown.position.x + x * cosine + z * sine,
    rider.target.position.y + shown.position.y - plate.target.position.y,
    shown.position.z - x * sine + z * cosine
  );
  group.rotation.y = rider.target.orientation + turn;
}

/*
 * Whether a ride just ended on a plate that is not moving, such as one this page's own hand put back: the rider stops with it.
 * A rider another player takes off the plate glides to their hand instead.
 */
function rideEndsAtOnce(rider: PoseState): boolean {
  const plate = rider.rodeOn;
  rider.rodeOn = undefined;
  return !!plate && !plate.smoothing.active && !rider.smoothing.wasRemote;
}

type PoseLinks = {
  /** The piece's id when it is a plate that others may ride. */
  plateId?: string;
  /** The plate this piece rides, while someone else carries it. */
  follows?: string;
};

/* A plate's pose, shared with the scene while it is mounted. */
function usePlatePose(
  plates: Map<string, PoseState> | null,
  plateId: string | undefined,
  pose: { current: PoseState }
) {
  useLayoutEffect(() => {
    if (!plates || !plateId) {
      return;
    }
    const plate = pose.current;
    plates.set(plateId, plate);
    return () => {
      if (plates.get(plateId) === plate) {
        plates.delete(plateId);
      }
    };
  }, [plates, plateId, pose]);
}

export function useTablePose(
  position: Vector3Tuple,
  orientation: number,
  remote: boolean,
  immediate = false,
  { plateId, follows }: PoseLinks = {}
) {
  const [positionX, positionY, positionZ] = position;
  const groupRef = useRef<Group>(null);
  const pose = useRef<PoseState>({
    group: groupRef,
    target: { position: new Vector3(...position), orientation },
    smoothing: { active: false, wasRemote: false },
  });
  const initialized = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const plates = useContext(PlatePosesContext);
  usePlatePose(plates, plateId, pose);
  useLayoutEffect(() => {
    const { target, smoothing } = pose.current;
    target.position.set(positionX, positionY, positionZ);
    target.orientation = orientation;
    /* A ride that ends glides on from where the rider was last shown. */
    retargetPoseSmoothing(smoothing, remote || Boolean(follows), immediate);
    const group = groupRef.current;
    /* A rider is placed only in the frame, once its plate has taken its own pose there: plates commit their new targets in any order. */
    if (group && (!initialized.current || (!follows && !smoothing.active))) {
      snapTablePose(group, target);
      initialized.current = true;
    }
    invalidate();
  }, [follows, immediate, invalidate, orientation, plates, positionX, positionY, positionZ, remote]);
  useFrame(
    (_, delta) => {
      const group = groupRef.current;
      const { target, smoothing } = pose.current;
      if (!group) {
        return;
      }
      if (follows) {
        pose.current.rodeOn = plates?.get(follows);
        placeRider(pose.current, pose.current.rodeOn);
        return;
      }
      if (rideEndsAtOnce(pose.current)) {
        smoothing.active = false;
        snapTablePose(group, target);
      }
      if (!smoothing.active) {
        return;
      }
      smoothing.active = advanceTablePose(group, target, delta);
      if (smoothing.active) {
        invalidate();
      }
    },
    { priority: plateId ? PLATE_FRAME_PRIORITY : 0 }
  );
  return groupRef;
}
