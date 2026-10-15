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
 */
type Follower = { group: { current: Group | null }; target: TablePose };
type PlateFollowers = Map<string, Set<Follower>>;
const PlateFollowersContext = createContext<PlateFollowers | null>(null);

/** The scene's plates and the pieces following each, so a plate can carry them frame by frame. */
export function PlateFollowersProvider({ children }: { children: ReactNode }) {
  const followers = useMemo<PlateFollowers>(() => new Map(), []);
  return createElement(PlateFollowersContext.Provider, { value: followers }, children);
}

/* A follower placed where its target sits on the plate's target, carried to where the plate is shown. */
function placeFollower(follower: Follower, plate: Group, plateTarget: TablePose) {
  const group = follower.group.current;
  if (!group) {
    return;
  }
  const turn = plate.rotation.y - plateTarget.orientation;
  const x = follower.target.position.x - plateTarget.position.x;
  const z = follower.target.position.z - plateTarget.position.z;
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  group.position.set(
    plate.position.x + x * cosine + z * sine,
    follower.target.position.y + plate.position.y - plateTarget.position.y,
    plate.position.z - x * sine + z * cosine
  );
  group.rotation.y = follower.target.orientation + turn;
}

/* Every piece following a plate, placed where the plate is now shown. */
function carryFollowers(
  followers: PlateFollowers | null,
  plateId: string | undefined,
  plate: Group,
  target: TablePose
) {
  if (plateId) {
    followers?.get(plateId)?.forEach((follower) => placeFollower(follower, plate, target));
  }
}

type PoseLinks = {
  /** The piece's id when it is a plate that others may follow. */
  plateId?: string;
  /** The plate this piece follows, while it rides one someone else carries. */
  follows?: string;
};

export function useTablePose(
  position: Vector3Tuple,
  orientation: number,
  remote: boolean,
  immediate = false,
  { plateId, follows }: PoseLinks = {}
) {
  const [positionX, positionY, positionZ] = position;
  const groupRef = useRef<Group>(null);
  const target = useRef({ position: new Vector3(...position), orientation });
  const initialized = useRef(false);
  const smoothing = useRef<PoseSmoothing>({ active: false, wasRemote: false });
  const invalidate = useThree((state) => state.invalidate);
  const followers = useContext(PlateFollowersContext);
  useLayoutEffect(() => {
    if (!followers || !follows) {
      return;
    }
    const follower: Follower = { group: groupRef, target: target.current };
    const set = followers.get(follows) ?? new Set();
    followers.set(follows, set.add(follower));
    return () => {
      set.delete(follower);
      if (!set.size && followers.get(follows) === set) {
        followers.delete(follows);
      }
    };
  }, [followers, follows]);
  useLayoutEffect(() => {
    target.current.position.set(positionX, positionY, positionZ);
    target.current.orientation = orientation;
    /* A follower that lets go of its plate glides on from wherever the plate left it. */
    retargetPoseSmoothing(smoothing.current, remote || Boolean(follows), immediate);
    const group = groupRef.current;
    const shouldSnap = !initialized.current || (!smoothing.current.active && !follows);
    if (group && shouldSnap) {
      snapTablePose(group, target.current);
      initialized.current = true;
      carryFollowers(followers, plateId, group, target.current);
    }
    invalidate();
  }, [followers, follows, immediate, invalidate, orientation, plateId, positionX, positionY, positionZ, remote]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group || follows || !smoothing.current.active) {
      return;
    }
    smoothing.current.active = advanceTablePose(group, target.current, delta);
    carryFollowers(followers, plateId, group, target.current);
    if (smoothing.current.active) {
      invalidate();
    }
  });
  return groupRef;
}
