/* @jsxImportSource @app/widgets/tabletop/three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { PublicBattle } from '@shared/play/battle';
import type { Vector3Tuple } from '@shared/play/model';
import { phaseAt, STANDARD_PHASES } from '@shared/play/phases';
import { TRACKER_DISC_CONTENT_Y, trackerArcSlots } from '@shared/play/tableTrackers';
import type { RefObject } from 'react';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Group } from 'three';

import type { TableProjection } from '../../../../db/tabletop/TableSession';
import { useMotionAllowed } from '../../../../styles/motion';
import type { PointerSession } from '../../../../widgets/tabletop/PointerSession';
import { PointerSessionContext } from '../../../../widgets/tabletop/PointerSessionContext';
import styles from './BattleBeacon.module.css';
import type { BeaconMode, BeaconMotion, BeaconSpot } from './beaconMotion';
import { beaconMode, beaconRisen, beaconTarget, HOME_HEIGHT, initialMotion, stepBeacon } from './beaconMotion';
import type { BeaconPose } from './StrikeMark';
import { BEACON_FRAME, StrikeMark } from './StrikeMark';
import { useBeaconCarry } from './useBeaconCarry';

/* The game refuses a mark it cannot place; the beacon waits this long for the battle before it returns to the tracker. */
const PENDING_MS = 2500;

function useBeaconHome(table: TableProjection) {
  const phases = table.snapshot.phases ?? STANDARD_PHASES;
  const inBattle = phaseAt(table.snapshot.phase, phases).id === 'battle';
  const battleIndex = phases.findIndex((entry) => entry.id === 'battle');
  const slot = trackerArcSlots(phases.length).find((entry) => entry.phaseIndex === battleIndex);
  const homeX = slot?.position[0];
  const homeZ = slot?.position[2];
  const home = useMemo(
    () =>
      homeX === undefined || homeZ === undefined
        ? null
        : { x: homeX, z: homeZ, ground: TRACKER_DISC_CONTENT_Y + 0.004 },
    [homeX, homeZ]
  );
  return { inBattle, home };
}

/** The point the beacon was dropped on, held until the battle arrives or the game is plainly not placing one. */
function usePendingDrop(battle: PublicBattle | null | undefined, inBattle: boolean) {
  const [pending, setPending] = useState<Vector3Tuple | null>(null);
  if (pending !== null && (battle || !inBattle)) {
    setPending(null);
  }
  useEffect(() => {
    if (!pending) {
      return;
    }
    const timer = setTimeout(() => setPending(null), PENDING_MS);
    return () => clearTimeout(timer);
  }, [pending]);
  return [pending, setPending] as const;
}

/* Tracks whether the beacon is up at its tracker, rendering only when that changes. */
function useRisen() {
  /* The handle appears only once the beacon is up, so nobody grabs a beacon still rising or sinking out of sight. */
  const [risen, setRisen] = useState(false);
  const shown = useRef(false);
  const report = (state: BeaconMotion) => {
    if (beaconRisen(state) !== shown.current) {
      shown.current = beaconRisen(state);
      setRisen(shown.current);
    }
  };
  return [risen, report] as const;
}

/* Places the beacon's group and handle for this frame, and updates the pose the strike mark draws from. */
function applyFrame(
  state: BeaconMotion,
  frame: ReturnType<typeof stepBeacon>,
  parts: { group: Group; handle: Group | null; pose: BeaconPose; carried: boolean; motion: boolean }
) {
  parts.group.position.set(state.x, frame.y, state.z);
  parts.group.visible = frame.visible;
  parts.group.scale.setScalar(frame.scale);
  Object.assign(parts.pose, {
    flat: state.flat,
    height: state.height,
    fade: state.fade,
    motion: parts.motion,
    carried: parts.carried,
  });
  parts.handle?.position.setY(state.height);
}

/** Moves the beacon every frame from its motion state, and hands the strike mark the pose it draws. */
function useBeaconFrame({
  home,
  mode,
  anchor,
  pending,
  carryAt,
  motion,
  group,
  handle,
}: {
  home: BeaconSpot | null;
  mode: BeaconMode;
  anchor: Vector3Tuple | undefined;
  pending: Vector3Tuple | null;
  /* Read every frame, since a carry moves the point without rendering. */
  carryAt(): Vector3Tuple | null;
  motion: boolean;
  group: RefObject<Group | null>;
  handle: RefObject<Group | null>;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const pose = useRef<BeaconPose>({ flat: 0, height: HOME_HEIGHT, fade: 1, carried: false, motion });
  const moving = useRef<BeaconMotion | null>(null);
  const [risen, reportRisen] = useRisen();
  useEffect(() => invalidate(), [mode, motion, invalidate]);
  useFrame((_state, delta) => {
    if (!home || !group.current) {
      return;
    }
    const carried = mode === 'carry';
    const target = beaconTarget(mode, home, { anchor, pending, carry: carried ? carryAt() : null });
    moving.current ??= initialMotion(home, mode, target);
    const frame = stepBeacon(moving.current, { mode, target, delta, motion });
    reportRisen(moving.current);
    applyFrame(moving.current, frame, {
      group: group.current,
      handle: handle.current,
      pose: pose.current,
      carried,
      motion,
    });
    if (frame.animating) {
      invalidate();
    }
  }, BEACON_FRAME);
  return { pose, risen };
}

/* A primary press on an enabled handle picks the beacon up, unless a piece already in hand holds the pointer. */
const mayPickUp = (event: PointerEvent, enabled: boolean, pointerSession: PointerSession | null) =>
  enabled && event.button === 0 && !pointerSession?.busy;

/** An invisible button over the disc: what players grab, and what assistive tech and tests find. */
function BeaconHandle({
  handle,
  enabled,
  pickUp,
}: {
  handle: RefObject<Group | null>;
  enabled: boolean;
  pickUp(event: PointerEvent): void;
}) {
  const pointerSession = useContext(PointerSessionContext);
  return (
    <group ref={handle} position={[0, HOME_HEIGHT, 0]}>
      <Html center zIndexRange={[1, 0]}>
        <button
          type="button"
          className={styles.handle}
          aria-label="Drag battle marker onto territory"
          data-local-carry
          disabled={!enabled}
          onPointerDown={(event) => {
            /* The press is the beacon's alone: a piece under the handle must not start a carry of its own. */
            event.stopPropagation();
            if (mayPickUp(event.nativeEvent, enabled, pointerSession)) {
              pickUp(event.nativeEvent);
            }
          }}
        />
      </Html>
    </group>
  );
}

/* The handle shows on a risen beacon at its tracker, and stays under the pointer through a carry. */
const handleShown = (mode: BeaconMode, risen: boolean) => (mode === 'home' && risen) || mode === 'carry';

/**
 * Whether this player may pick the beacon up: in the Battle phase, with no battle running, while handling the table.
 * A carry ends when that stops: the phase ends, someone else starts a battle, or the player may no longer handle the table.
 */
function useCarryAllowed(table: TableProjection, inBattle: boolean, battle: boolean, putDown: () => void) {
  const allowed = inBattle && !battle && table.canHandleTable;
  useEffect(() => {
    if (!allowed) {
      putDown();
    }
  }, [allowed, putDown]);
  return allowed;
}

type Props = {
  table: TableProjection;
  battle: PublicBattle | null | undefined;
  /** Marks a battle where the beacon was dropped; the game decides whether it stands. */
  onDrop(position: Vector3Tuple): void;
};

/**
 * The battle beacon: during the Battle phase it rises through the table over the tracker's Battle disc and hovers there.
 * A player picks it up like a piece and drops it on a territory, where it lies flat and fades out as the battle shows.
 * A finished battle brings a new one up at the tracker;
 * when the phase ends it sinks back into the table.
 */
export function BattleBeacon({ table, battle, onDrop }: Props) {
  const { inBattle, home } = useBeaconHome(table);
  const { camera, renderer, invalidate } = useThree();
  const [pending, setPending] = usePendingDrop(battle, inBattle);
  const motion = useMotionAllowed();
  const { carrying, carryAt, pickUp, putDown } = useBeaconCarry({
    canvas: renderer.domElement,
    camera,
    invalidate,
    onDrop(point) {
      setPending(point);
      onDrop(point);
    },
  });
  const group = useRef<Group>(null);
  const handle = useRef<Group>(null);
  const mode = beaconMode({ inBattle, battle: Boolean(battle), pending: Boolean(pending), carrying });
  const carryAllowed = useCarryAllowed(table, inBattle, Boolean(battle), putDown);
  const { pose, risen } = useBeaconFrame({
    home,
    mode,
    anchor: battle?.anchor,
    pending,
    carryAt,
    motion,
    group,
    handle,
  });

  if (!home) {
    return null;
  }
  return (
    <group ref={group} visible={false}>
      <StrikeMark pose={pose} />
      {handleShown(mode, risen) ? (
        <BeaconHandle handle={handle} enabled={mode === 'home' && carryAllowed} pickUp={pickUp} />
      ) : null}
    </group>
  );
}
