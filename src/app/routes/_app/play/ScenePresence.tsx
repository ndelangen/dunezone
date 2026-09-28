/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import type { PublicPointer } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { CARRIED_BASE_Y, pointOnRayAtHeight } from '@shared/play/tableGeometry';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { Group } from 'three';
import { Raycaster, Vector2, Vector3 } from 'three';

import { usePresence } from './multiplayer/PresenceContext';

function rectangleContainsPoint(bounds: DOMRect, x: number, y: number) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

export function isPublicTablePoint(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  const bounds = canvas.getBoundingClientRect();
  if (!rectangleContainsPoint(bounds, x, y)) {
    return false;
  }
  /* Pointer capture and inert overlays can both bypass normal DOM hit testing. */
  for (const panel of document.querySelectorAll<HTMLElement>('[data-private-hand]')) {
    if (panel.hidden || panel.getClientRects().length === 0) {
      continue;
    }
    const rectangle = panel.getBoundingClientRect();
    if (rectangleContainsPoint(rectangle, x, y)) {
      return false;
    }
  }
  return true;
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

/* A frame counts for its real length up to this cap, so a pose settles in the same wall-clock time down to 4 fps, and a longer stall still counts as the cap. */
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
  const { invalidate } = useThree();
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

function RemoteHand({ pointer }: { pointer: PublicPointer }) {
  const group = useTablePose(pointer.position, 0, true);
  return (
    <group ref={group}>
      <Html zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}>
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
              fill={pointer.color}
              stroke="#2a2018"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          <span
            style={{
              color: pointer.color,
              background: '#21170de6',
              border: `1px solid ${pointer.color}`,
              borderRadius: 4,
              padding: '2px 5px',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
              fontWeight: 650,
            }}
          >
            {pointer.displayName}
          </span>
        </div>
      </Html>
    </group>
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
};
declare global {
  interface Window {
    __duneTable?: TableDiagnostic;
  }
}

export function ScenePresence() {
  const { pointers, canInteract, publishPointer } = usePresence();
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
      if (!isPublicTablePoint(canvas, point.x, point.y)) {
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
    if (!import.meta.env.DEV) {
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
          <RemoteHand key={pointer.connectionId} pointer={pointer} />
        ))}
    </>
  );
}
