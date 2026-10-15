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
 * A rider stays with its plate until the plate settles, even once the carry ends, so a drop or a cancel turns it with the plate too.
 */
type PoseNode = { group: { current: Group | null }; target: TablePose };
type Follower = PoseNode & { plateId: string | null; lingering: boolean };
type Plate = PoseNode & { smoothing: PoseSmoothing };
type PlateLink = { plate: Plate | null; followers: Set<Follower> };
/* Everything a piece's pose keeps between frames, mutated in place: a piece may be a plate, a follower, or neither. */
type PoseState = Plate & Follower;

class PlateFollowers {
  private readonly links = new Map<string, PlateLink>();

  private link(plateId: string): PlateLink {
    const existing = this.links.get(plateId);
    if (existing) {
      return existing;
    }
    const created: PlateLink = { plate: null, followers: new Set() };
    this.links.set(plateId, created);
    return created;
  }

  private prune(plateId: string) {
    const link = this.links.get(plateId);
    if (link && !link.plate && !link.followers.size) {
      this.links.delete(plateId);
    }
  }

  setPlate(plateId: string, plate: PlateLink['plate']) {
    this.link(plateId).plate = plate;
    if (!plate) {
      this.settle(plateId);
      this.prune(plateId);
    }
  }

  /** Every follower placed where the plate is now shown. */
  carry(plateId: string) {
    const { plate, followers } = this.link(plateId);
    followers.forEach((follower) => placeFollower(follower, plate));
  }

  /** The plate has come to rest: whoever only stayed on for the ride is let go, at its own pose. */
  settle(plateId: string) {
    const link = this.links.get(plateId);
    link?.followers.forEach((follower) => {
      if (follower.lingering) {
        this.detach(follower);
        if (follower.group.current) {
          snapTablePose(follower.group.current, follower.target);
        }
      }
    });
  }

  attach(follower: Follower, plateId: string) {
    if (follower.plateId !== plateId) {
      this.detach(follower);
      follower.plateId = plateId;
      this.link(plateId).followers.add(follower);
    }
    follower.lingering = false;
    placeFollower(follower, this.link(plateId).plate);
  }

  /*
   * A follower whose carry ended rides on while its plate is still settling.
   * Whether the plate still moves is known only once every piece has taken the new table, a cancel's turn back included, so it is decided after.
   */
  release(follower: Follower) {
    const plateId = follower.plateId;
    if (!plateId) {
      return;
    }
    follower.lingering = true;
    queueMicrotask(() => this.settleIfStill(plateId));
  }

  /** Lets go of whoever only stayed on for the ride when the plate is not moving. */
  settleIfStill(plateId: string) {
    if (!this.links.get(plateId)?.plate?.smoothing.active) {
      this.settle(plateId);
    }
  }

  detach(follower: Follower) {
    const plateId = follower.plateId;
    if (plateId) {
      this.links.get(plateId)?.followers.delete(follower);
      follower.plateId = null;
      follower.lingering = false;
      this.prune(plateId);
    }
  }
}

const PlateFollowersContext = createContext<PlateFollowers | null>(null);

/** The scene's plates and the pieces following each, so a plate can carry them frame by frame. */
export function PlateFollowersProvider({ children }: { children: ReactNode }) {
  const followers = useMemo(() => new PlateFollowers(), []);
  return createElement(PlateFollowersContext.Provider, { value: followers }, children);
}

/* A follower placed where its target sits on the plate's target, carried to where the plate is shown. */
function placeFollower(follower: PoseNode, plate: PoseNode | null) {
  const group = follower.group.current;
  const shown = plate?.group.current;
  if (!group || !shown || !plate) {
    return;
  }
  const turn = shown.rotation.y - plate.target.orientation;
  const x = follower.target.position.x - plate.target.position.x;
  const z = follower.target.position.z - plate.target.position.z;
  const cosine = Math.cos(turn);
  const sine = Math.sin(turn);
  group.position.set(
    shown.position.x + x * cosine + z * sine,
    follower.target.position.y + shown.position.y - plate.target.position.y,
    shown.position.z - x * sine + z * cosine
  );
  group.rotation.y = follower.target.orientation + turn;
}

type PoseLinks = {
  /** The piece's id when it is a plate that others may follow. */
  plateId?: string;
  /** The plate this piece follows, while it rides one someone else carries. */
  follows?: string;
};

/* A plate's pose and smoothing, shared with the scene so its followers can be placed from it. */
function usePlateLink(followers: PlateFollowers | null, plateId: string | undefined, pose: { current: PoseState }) {
  useLayoutEffect(() => {
    if (!followers || !plateId) {
      return;
    }
    followers.setPlate(plateId, pose.current);
    return () => followers.setPlate(plateId, null);
  }, [followers, plateId, pose]);
}

/* A rider's place among its plate's followers: on while it rides, lingering until the plate settles once the ride ends. */
function useFollowerLink(followers: PlateFollowers | null, follows: string | undefined, pose: { current: PoseState }) {
  useLayoutEffect(() => {
    if (!followers || !follows) {
      return;
    }
    const follower = pose.current;
    followers.attach(follower, follows);
    return () => followers.release(follower);
  }, [followers, follows, pose]);
  useLayoutEffect(() => {
    const follower = pose.current;
    return () => followers?.detach(follower);
  }, [followers, pose]);
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
    plateId: null,
    lingering: false,
  });
  const initialized = useRef(false);
  const invalidate = useThree((state) => state.invalidate);
  const followers = useContext(PlateFollowersContext);
  usePlateLink(followers, plateId, pose);
  useFollowerLink(followers, follows, pose);
  useLayoutEffect(() => {
    const { target, smoothing } = pose.current;
    target.position.set(positionX, positionY, positionZ);
    target.orientation = orientation;
    retargetPoseSmoothing(smoothing, remote || Boolean(follows), immediate);
    const group = groupRef.current;
    /* A rider picked up on its own leaves the plate it was still riding out. */
    if (pose.current.lingering && (remote || immediate)) {
      followers?.detach(pose.current);
    }
    if (pose.current.plateId) {
      /* A rider is placed by its plate, wherever the plate is shown now, even when the plate is still. */
      followers?.carry(pose.current.plateId);
      initialized.current = true;
    } else if (group && (!initialized.current || !smoothing.active)) {
      snapTablePose(group, target);
      initialized.current = true;
    }
    if (plateId) {
      followers?.carry(plateId);
      followers?.settleIfStill(plateId);
    }
    invalidate();
  }, [followers, follows, immediate, invalidate, orientation, plateId, positionX, positionY, positionZ, remote]);
  useFrame((_, delta) => {
    const group = groupRef.current;
    const { target, smoothing } = pose.current;
    if (!group || pose.current.plateId || !smoothing.active) {
      return;
    }
    smoothing.active = advanceTablePose(group, target, delta);
    if (plateId) {
      followers?.carry(plateId);
      followers?.settleIfStill(plateId);
    }
    if (smoothing.active) {
      invalidate();
    }
  });
  return groupRef;
}
