/* @jsxImportSource ./three-jsx */
import { Html } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import type { PublicPointer } from '@shared/play/protocol';
import { SPECTATOR_SEAT } from '@shared/play/schema';
import { CARRIED_BASE_Y, pointOnRayAtHeight } from '@shared/play/tableGeometry';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Raycaster, Vector2, Vector3 } from 'three';

import { unsettledArtworkLoads } from './artworkLoads';
import styles from './ScenePresence.module.css';
import { tablePlateOutline, tableSurfacePointOnRay } from './tablePlateGeometry';
import { isCursorTablePoint } from './tablePointerPoint';
import { useTabletopActions, useTabletopCommands, useTabletopSelector } from './TabletopContext';
import { useTablePose } from './useTablePose';

const HAND_PATH =
  'M6 18V4a2 2 0 0 1 4 0v10V11a2 2 0 0 1 4 0v4v-2a2 2 0 0 1 4 0v3v-1a2 2 0 0 1 4 0v8c0 3-2 6-5 7H9l-7-9c-2-3 1-5 3-3l3 3';
const HAND_HTML_STYLE = { pointerEvents: 'none' } as const;
const HAND_Z_RANGE = [6, 0];

/*
 * A pointer moves many times a second while its label never changes, so the hand follows the position in the scene
 * and keeps one label element: drei's `Html` renders its own React root again whenever its children change.
 */
export const TableHand = memo(function TableHand({
  position,
  color,
  displayName,
  avatarUrl,
  local = false,
  demo = false,
}: Pick<PublicPointer, 'position' | 'color' | 'displayName' | 'avatarUrl'> & { local?: boolean; demo?: boolean }) {
  const group = useTablePose(position, 0, !local);
  const label = useMemo(
    () => <HandLabel color={color} displayName={displayName} avatarUrl={avatarUrl} local={local} demo={demo} />,
    [color, displayName, avatarUrl, local, demo]
  );
  return (
    <group ref={group}>
      <Html zIndexRange={HAND_Z_RANGE} style={HAND_HTML_STYLE}>
        {label}
      </Html>
    </group>
  );
});

function HandLabel({
  color,
  displayName,
  avatarUrl,
  local,
  demo,
}: Pick<PublicPointer, 'color' | 'displayName' | 'avatarUrl'> & { local: boolean; demo: boolean }) {
  return (
    <div
      data-table-hand={demo ? 'demo' : local ? 'local' : 'remote'}
      className={demo ? styles.demoHand : undefined}
      aria-hidden={displayName ? undefined : true}
      style={{
        position: 'relative',
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
        <path d={HAND_PATH} fill={color} stroke="#2a2018" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <HandAvatar color={color} avatarUrl={avatarUrl} />
      {displayName && (
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
      )}
    </div>
  );
}

function HandAvatar({ color, avatarUrl }: Pick<PublicPointer, 'color' | 'avatarUrl'>) {
  return avatarUrl !== undefined ? (
    <span className={styles.avatar} style={{ borderColor: color }}>
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="11" r="6" fill={color} />
        <path d="M4 32v-5a12 12 0 0 1 24 0v5" fill={color} />
      </svg>
      {avatarUrl && (
        <img
          key={avatarUrl}
          src={avatarUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
    </span>
  ) : null;
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
  selected: boolean;
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

const NO_TRACKERS: readonly TrackerArcSlot[] = [];

export function ScenePresence({
  showNames = true,
  showLocal = false,
  trackerSlots = NO_TRACKERS,
}: {
  readonly showNames?: boolean;
  readonly showLocal?: boolean;
  /* The trackers the table plate grows around, so a ping lands wherever the plate is drawn. */
  readonly trackerSlots?: readonly TrackerArcSlot[];
}) {
  const plateOutline = useMemo(() => tablePlateOutline(trackerSlots), [trackerSlots]);
  const viewer = useTabletopSelector((table) => table.viewer);
  const canInteract = useTabletopSelector((table) => table.canInteract);
  const { publishPointer } = useTabletopCommands();
  const { subscribePointers, getPointers } = useTabletopActions();
  const pointers = useSyncExternalStore(subscribePointers, getPointers);
  const camera = useThree((state) => state.camera);
  const renderer = useThree((state) => state.renderer);
  const scene = useThree((state) => state.scene);
  const updateLocalCursor = useRef<(point: { x: number; y: number; touch: boolean } | null) => void>(() => {});
  useLayoutEffect(() => {
    if (!showLocal) {
      return;
    }
    /* The browser owns the local cursor; only its avatar follows input in the DOM, independently of scene frames. */
    const canvas = renderer.domElement;
    const color = viewer.color.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="32" viewBox="0 0 26 32"><path d="${HAND_PATH}" fill="${color}" stroke="#2a2018" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    const cursor = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 8 2, pointer`;
    canvas.style.setProperty('--table-hand-cursor', cursor);
    const label = document.createElement('div');
    label.dataset.tableHand = 'local';
    label.className = styles.localHand;
    label.hidden = true;
    label.setAttribute('aria-hidden', 'true');
    document.body.append(label);
    const root = createRoot(label);
    root.render(<HandAvatar color={viewer.color} avatarUrl={viewer.avatarUrl} />);
    updateLocalCursor.current = (point) => {
      const visible = point !== null && !point.touch;
      label.hidden = !visible;
      canvas.classList.toggle(styles.localCursor, visible);
      if (visible) {
        label.style.transform = `translate3d(${point.x - 8}px, ${point.y - 2}px, 0)`;
      }
    };
    return () => {
      updateLocalCursor.current = () => {};
      canvas.classList.remove(styles.localCursor);
      canvas.style.removeProperty('--table-hand-cursor');
      label.remove();
      queueMicrotask(() => root.unmount());
    };
  }, [renderer.domElement, showLocal, viewer.color, viewer.avatarUrl]);
  const raycaster = useMemo(() => new Raycaster(), []);
  const normalized = useMemo(() => new Vector2(), []);
  const lastScreenPoint = useRef<{ x: number; y: number; touch: boolean } | null>(null);
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
      const unavailable = (!canInteract && !showLocal) || document.hidden || !point;
      if (unavailable) {
        updateLocalCursor.current(null);
        publishPointer(null);
        return;
      }
      if (!isCursorTablePoint(canvas, point.x, point.y)) {
        updateLocalCursor.current(null);
        publishPointer(null);
        return;
      }
      const hit = document.elementFromPoint(point.x, point.y);
      if (hit && hit !== canvas) {
        updateLocalCursor.current(null);
        publishPointer(null);
        return;
      }
      updateLocalCursor.current(showLocal ? point : null);
      const bounds = canvas.getBoundingClientRect();
      normalized.set(
        ((point.x - bounds.left) / bounds.width) * 2 - 1,
        -((point.y - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(normalized, camera);
      const origin = raycaster.ray.origin.toArray() as Vector3Tuple;
      const direction = raycaster.ray.direction.toArray() as Vector3Tuple;
      const position = pointOnRayAtHeight(origin, direction, CARRIED_BASE_Y);
      publishPointer(canInteract ? position : null, tableSurfacePointOnRay(origin, direction, plateOutline));
    };
  }, [camera, canInteract, normalized, plateOutline, publishPointer, raycaster, renderer.domElement, showLocal]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      lastScreenPoint.current = { x: event.clientX, y: event.clientY, touch: event.pointerType === 'touch' };
      publish.current();
    };
    const clear = () => {
      lastScreenPoint.current = null;
      updateLocalCursor.current(null);
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
    const reposition = () => publish.current();
    window.addEventListener('pointermove', move, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('pointerout', leave, true);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
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
          <TableHand
            key={pointer.connectionId}
            position={pointer.position}
            color={pointer.color}
            avatarUrl={pointer.avatarUrl}
            displayName={showNames ? pointer.displayName : ''}
          />
        ))}
    </>
  );
}
