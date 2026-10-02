/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import type { PublicPointer } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { CARRIED_BASE_Y, pointOnRayAtHeight } from '@shared/play/tableGeometry';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Group } from 'three';
import { Raycaster, Vector2, Vector3 } from 'three';

import { unsettledArtworkLoads } from './artworkLoads';
import { useTabletop, useTabletopActions } from './TabletopContext';

function rectangleContainsPoint(bounds: DOMRect, x: number, y: number) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function coveredBy(selector: string, x: number, y: number) {
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    if (element.hidden || element.getClientRects().length === 0) {
      continue;
    }
    if (rectangleContainsPoint(element.getBoundingClientRect(), x, y)) {
      return true;
    }
  }
  return false;
}

export function isPublicTablePoint(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  if (!rectangleContainsPoint(canvas.getBoundingClientRect(), x, y)) {
    return false;
  }
  /* Pointer capture and inert overlays can both bypass normal DOM hit testing. */
  return !coveredBy('[data-private-hand]', x, y);
}

/**
 * Whether a resting pointer shows as a cursor to the other players.
 * Chrome drawn over the scene, such as the header, lets the pointer through to the canvas, so hit testing alone would publish a point the player cannot see (#1665).
 * A drag still follows the pointer under it.
 */
export function isCursorTablePoint(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  return isPublicTablePoint(canvas, x, y) && !coveredBy('[data-hides-cursor]', x, y);
}

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

const REMOTE_HAND_HTML_STYLE = { pointerEvents: 'none' } as const;
const REMOTE_HAND_Z_RANGE = [6, 0];

/*
 * A pointer moves many times a second while its label never changes, so the hand follows the position in the scene
 * and keeps one label element: drei's `Html` renders its own React root again whenever its children change.
 */
const RemoteHand = memo(function RemoteHand({
  position,
  color,
  displayName,
}: Pick<PublicPointer, 'position' | 'color' | 'displayName'>) {
  const group = useTablePose(position, 0, true);
  const label = useMemo(() => <RemoteHandLabel color={color} displayName={displayName} />, [color, displayName]);
  return (
    <group ref={group}>
      <Html zIndexRange={REMOTE_HAND_Z_RANGE} style={REMOTE_HAND_HTML_STYLE}>
        {label}
      </Html>
    </group>
  );
});

function RemoteHandLabel({ color, displayName }: Pick<PublicPointer, 'color' | 'displayName'>) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 3,
        transform: 'translate(-8px, -2px)',
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <svg
        width="26"
        height="32"
        viewBox="0 0 26 32"
        aria-hidden="true"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 2px 2px #0008)', flexShrink: 0 }}
      >
        <path
          d="M6 18V4a2 2 0 0 1 4 0v10V11a2 2 0 0 1 4 0v4v-2a2 2 0 0 1 4 0v3v-1a2 2 0 0 1 4 0v8c0 3-2 6-5 7H9l-7-9c-2-3 1-5 3-3l3 3"
          fill={color}
          stroke="#2a2018"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
      <span
        style={{
          color,
          background: '#21170de6',
          border: `1px solid ${color}`,
          borderRadius: 4,
          padding: '2px 5px',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11,
          fontWeight: 650,
        }}
      >
        {displayName}
      </span>
    </div>
  );
}

type PieceDiagnostic = {
  id: string;
  count: number;
  itemIds: string[];
  position: Vector3Tuple;
  orientation: number;
  localCarried: boolean;
  remoteCarried: boolean;
  reserved: boolean;
};
type TableDiagnostic = {
  worldToScreen(position: Vector3Tuple): { x: number; y: number };
  pieces(): PieceDiagnostic[];
  /* One entry per player station the rim draws, in seat order. */
  stations(): Vector3Tuple[];
  pointers(): PublicPointer[];
  canvasBounds(): { x: number; y: number; width: number; height: number };
  /* Artwork loads on the page that have not settled; the verification waits for none before it acts on a new table (#1592). */
  unsettledArtwork(): number;
};
declare global {
  interface Window {
    __duneTable?: TableDiagnostic;
  }
}

export function ScenePresence() {
  const { canInteract, publishPointer } = useTabletop();
  const { subscribePointers, getPointers } = useTabletopActions();
  const pointers = useSyncExternalStore(subscribePointers, getPointers);
  const { camera, renderer, scene } = useThree();
  const raycaster = useMemo(() => new Raycaster(), []);
  const normalized = useMemo(() => new Vector2(), []);
  const lastScreenPoint = useRef<{ x: number; y: number } | null>(null);
  const lastCameraMatrix = useRef('');
  const latestPointers = useRef(pointers);
  useLayoutEffect(() => {
    latestPointers.current = pointers;
  }, [pointers]);
  const publish = useRef(() => {});
  useLayoutEffect(() => {
    publish.current = () => {
      const canvas = renderer.domElement;
      const point = lastScreenPoint.current;
      const unavailable = !canInteract || document.hidden || !point;
      if (unavailable) {
        publishPointer(null);
        return;
      }
      if (!isCursorTablePoint(canvas, point.x, point.y)) {
        publishPointer(null);
        return;
      }
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit && hit !== canvas) {
        publishPointer(null);
        return;
      }
      const bounds = canvas.getBoundingClientRect();
      normalized.set(
        ((point.x - bounds.left) / bounds.width) * 2 - 1,
        -((point.y - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(normalized, camera);
      publishPointer(
        pointOnRayAtHeight(
          [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
          [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z],
          CARRIED_BASE_Y
        )
      );
    };
  }, [camera, canInteract, normalized, publishPointer, raycaster, renderer.domElement]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      lastScreenPoint.current = { x: event.clientX, y: event.clientY };
      publish.current();
    };
    const clear = () => {
      lastScreenPoint.current = null;
      publishPointer(null);
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) {
        clear();
      }
    };
    const visibility = () => {
      if (document.hidden) {
        clear();
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerout', leave, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerout', leave, true);
      window.removeEventListener('blur', clear);
      document.removeEventListener('visibilitychange', visibility);
      clear();
    };
  }, [publishPointer]);
  useEffect(() => {
    if (!canInteract) {
      publishPointer(null);
    }
  }, [canInteract, publishPointer]);
  useFrame(() => {
    const matrix = `${camera.matrixWorld.elements.join(',')}:${camera.projectionMatrix.elements.join(',')}`;
    if (matrix !== lastCameraMatrix.current) {
      lastCameraMatrix.current = matrix;
      if (lastScreenPoint.current) {
        publish.current();
      }
    }
  });
  useEffect(() => {
    /* The local-auth build reuses its sign-in flag for browser verification, which projects table positions through this camera. */
    if (!(import.meta.env.DEV || import.meta.env.VITE_E2E_LOCAL_AUTH === 'true')) {
      return;
    }
    const diagnostic: TableDiagnostic = {
      worldToScreen(position) {
        const projected = new Vector3(...position).project(camera);
        const bounds = renderer.domElement.getBoundingClientRect();
        return {
          x: bounds.left + ((projected.x + 1) * bounds.width) / 2,
          y: bounds.top + ((1 - projected.y) * bounds.height) / 2,
        };
      },
      pieces() {
        const pieces: PieceDiagnostic[] = [];
        scene.traverse((object) => {
          const metadata = object.userData.duneTablePiece;
          if (!metadata) {
            return;
          }
          pieces.push({
            ...metadata,
            itemIds: [...metadata.itemIds],
            position: object.position.toArray() as Vector3Tuple,
            orientation: object.rotation.y,
          });
        });
        return pieces;
      },
      stations() {
        const stations: { index: number; position: Vector3Tuple }[] = [];
        scene.traverse((object) => {
          const index = object.userData.duneTableStation;
          if (typeof index === 'number') {
            stations.push({ index, position: object.position.toArray() as Vector3Tuple });
          }
        });
        stations.sort((left, right) => left.index - right.index);
        return stations.map((station) => station.position);
      },
      pointers: () => structuredClone(latestPointers.current),
      canvasBounds() {
        const { x, y, width, height } = renderer.domElement.getBoundingClientRect();
        return { x, y, width, height };
      },
      unsettledArtwork: unsettledArtworkLoads,
    };
    window.__duneTable = diagnostic;
    return () => {
      if (window.__duneTable === diagnostic) {
        delete window.__duneTable;
      }
    };
  }, [camera, renderer.domElement, scene]);
  return (
    <>
      {pointers
        .filter((pointer) => pointer.viewerSeat !== SPECTATOR_SEAT)
        .map((pointer) => (
          <RemoteHand
            key={pointer.connectionId}
            position={pointer.position}
            color={pointer.color}
            displayName={pointer.displayName}
          />
        ))}
    </>
  );
}
