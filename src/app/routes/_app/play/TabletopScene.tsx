/* @jsxImportSource ./three-jsx */
import { Html, Shadow, useTexture } from '@react-three/drei/webgpu';
import { Canvas, useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ThreeEvent } from '@react-three/fiber/webgpu';
import { isSpicePiece, SPICE_LAYER_HEIGHT, SPICE_LAYER_PITCH, SPICE_TOKEN_RADIUS } from '@shared/play/spice';
import { pointOnPieceDragRay } from '@shared/play/tableDragGeometry';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject, ReactNode } from 'react';
import type { ExtrudeGeometry, Group } from 'three';
import {
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Raycaster,
  RingGeometry,
  SRGBColorSpace,
  Vector2,
} from 'three';

import arrakisMapUrl from './assets/arrakis-map.png?url';
import stormMarkerUrl from './assets/storm-marker.png?url';
import { BOARD_RIM_DEPTH, createBoardRimShape } from './boardRimGeometry';
import { CameraControls, CameraRelativeFog } from './CameraControls';
import type { SceneMode } from './CameraControls';
import { gestureBlockReason, pieceCount, topItemFaceUp, zoneById, ZONES } from './model';
import type { TablePiece, Vector3Tuple, Zone } from './model';
import { usePresence } from './multiplayer/PresenceContext';
import { PhaseSymbol } from './PhaseSymbol';
import { CARD_LAYER_STAGGER, stackLayerItemIndex } from './pieceFlip';
import { cameraPoseFor, TABLE_CAMERA_FIELD_OF_VIEW } from './playView';
import type { CameraViewCommand } from './playView';
import { isPublicTablePoint, ScenePresence, useTablePose } from './ScenePresence';
import { SpiceSupply } from './SpiceSupply';
import {
  nearestStormRotation,
  STORM_MARKER_INNER_X,
  STORM_MARKER_OUTER_X,
  STORM_MARKER_TANGENTIAL_WIDTH,
  STORM_SECTOR_ANGLE,
  STORM_SECTOR_FILL_OPACITY,
  STORM_SECTOR_OUTLINE_OPACITY,
  stormRotationForSector,
  stormTransitionProgress,
} from './stormSector';
import { TableFurniture } from './TableFurniture';
import {
  BOARD_RADIUS,
  BOARD_RIM_RADIUS,
  BOARD_RIM_SURFACE_Y,
  BOARD_SURFACE_Y,
  CARD_DEPTH,
  CARD_LAYER_HEIGHT,
  CARD_LAYER_PITCH,
  CARD_WIDTH,
  CONTACT_SHADOW_EPSILON,
  contactShadowHeightAt,
  contactShadowOpacity,
  contactShadowScale,
  FORCE_BOTTOM_RADIUS,
  FORCE_FACE_RADIUS,
  FORCE_LAYER_HEIGHT,
  FORCE_LAYER_PITCH,
  FORCE_TOP_RADIUS,
  MARKER_BASE_HEIGHT,
  MARKER_BOTTOM_RADIUS,
  MARKER_CONE_CENTER_Y,
  MARKER_CONE_HEIGHT,
  MARKER_CONE_RADIUS,
  MARKER_TOP_RADIUS,
  pieceLabelHeight,
  RESERVE_PAD_DEPTH,
  RESERVE_PAD_WIDTH,
  stackTopHeight,
  surfaceHeightAt,
  visibleLayerCount,
} from './tableGeometry';
import { mapViewFramingPoints } from './tablePlateGeometry';
import { DEFAULT_TABLE_SEAT_COUNT, PLAYER_RING_RADIUS, tableSeatAngles, TABLE_SECTOR_COUNT } from './tableSettings';
import type { TableSeatCount } from './tableSettings';
import { useTabletop } from './TabletopContext';
import { activePhaseIndex, trackerArcSlots, trackerDiscColor, TRACKER_DISC_HEIGHT } from './tableTrackers';
import type { TrackerArcSlot, TableProgress } from './tableTrackers';
import { TurnTracker } from './TurnTracker';
import { usePieceFlipAnimation } from './usePieceFlipAnimation';

type TabletopSceneProps = {
  mode: SceneMode;
  interaction: 'select' | 'drag' | 'hybrid';
  className?: string;
  cameraView?: CameraViewCommand;
  focusZoneId?: string | null;
  onInteractionActiveChange?(active: boolean): void;
  seatCount?: TableSeatCount;
  /* PROTOTYPE (#1144): extra scene children rendered with the table. */
  extras?: ReactNode;
  tableProgress?: TableProgress;
  onSelectTurn?(turn: number): void;
};

const STACK_HOLD_MS = 320;
const SURFACE_DECAL_OFFSET = 0.001;
const BOARD_RIM_COLOR = '#15263b';
const BOARD_RIM_DIVIDER_COLOR = '#050505';
const BOARD_RIM_DIVIDER_OVERLAP = 0.002;
const BOARD_RIM_DIVIDER_WIDTH = 0.035;
const BOARD_RIM_ROUGHNESS = 0.72;
const BOARD_RIM_METALNESS = 0.06;
const BOARD_RIM_EXTRUDE_OPTIONS = {
  bevelEnabled: false,
  curveSegments: 64,
  depth: BOARD_RIM_DEPTH,
  steps: 1,
} as const;
const DEFAULT_CAMERA_VIEW: CameraViewCommand = { view: 'map', revision: 0 };

function ignoreRaycast() {
  /* Decorative scene geometry must never compete with tabletop interaction. */
}

type ActivePointerSession = {
  pieceId: string;
  pointerId: number;
};

type StormTransition = {
  startedAt: number;
  fromRotation: number;
  toRotation: number;
};

const STORM_MARKER_HOVER_Y = BOARD_SURFACE_Y + CONTACT_SHADOW_EPSILON;
const STORM_MARKER_RENDER_ORDER = 1;
const PHYSICAL_OBJECT_RENDER_ORDER = 2;

function createStormMarkerGeometry(): BufferGeometry {
  const halfWidth = STORM_MARKER_TANGENTIAL_WIDTH / 2;
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new Float32BufferAttribute(
      [
        STORM_MARKER_INNER_X,
        STORM_MARKER_HOVER_Y,
        -halfWidth,
        STORM_MARKER_INNER_X,
        STORM_MARKER_HOVER_Y,
        halfWidth,
        STORM_MARKER_OUTER_X,
        STORM_MARKER_HOVER_Y,
        halfWidth,
        STORM_MARKER_OUTER_X,
        STORM_MARKER_HOVER_Y,
        -halfWidth,
      ],
      3
    )
  );
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function PlayerStations({ seatCount }: { seatCount: TableSeatCount }) {
  const seatAngles = tableSeatAngles(seatCount);

  return (
    <group>
      {seatAngles.map((angle, index) => {
        const position: Vector3Tuple = [
          Math.cos(angle) * PLAYER_RING_RADIUS,
          BOARD_RIM_SURFACE_Y,
          Math.sin(angle) * PLAYER_RING_RADIUS,
        ];

        return (
          <group key={index} position={position}>
            <mesh
              position={[0, 0.001, 0]}
              renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
              rotation={[-Math.PI / 2, 0, 0]}
              raycast={ignoreRaycast}
            >
              <circleGeometry args={[0.19, 48]} />
              <meshBasicMaterial color="#fff0bd" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function BoardRim({ seatCount }: { seatCount: TableSeatCount }) {
  /* Replace the mesh with its geometry so WebGPU cannot reuse disposed buffers. */
  const shape = useMemo(() => createBoardRimShape(seatCount), [seatCount]);
  const geometryArgs = useMemo(
    () => [shape, BOARD_RIM_EXTRUDE_OPTIONS] as ConstructorParameters<typeof ExtrudeGeometry>,
    [shape]
  );

  return (
    <mesh
      key={shape.uuid}
      receiveShadow
      position={[0, BOARD_RIM_SURFACE_Y, 0]}
      raycast={ignoreRaycast}
      rotation={[Math.PI / 2, 0, 0]}
    >
      <extrudeGeometry args={geometryArgs} />
      <meshStandardMaterial color={BOARD_RIM_COLOR} roughness={BOARD_RIM_ROUGHNESS} metalness={BOARD_RIM_METALNESS} />
    </mesh>
  );
}

function TableTrackers({
  progress,
  slots,
  onSelectTurn,
}: {
  progress: TableProgress;
  slots: readonly TrackerArcSlot[];
  onSelectTurn?: TabletopSceneProps['onSelectTurn'];
}) {
  const currentPhaseIndex = activePhaseIndex(progress);
  const { canInteract } = usePresence();

  return (
    <group>
      {slots.map((slot) => {
        const symbol = slot.phaseIndex === null ? undefined : progress.phases[slot.phaseIndex]?.symbol;
        const highlighted = slot.kind === 'phase' && slot.phaseIndex === currentPhaseIndex;
        const color = trackerDiscColor(slot, currentPhaseIndex);
        return (
          <group
            key={slot.kind === 'phase' ? progress.phases[slot.phaseIndex ?? 0]?.id : slot.kind}
            position={slot.position}
          >
            <mesh key={slot.radius} receiveShadow position={[0, TRACKER_DISC_HEIGHT / 2, 0]} raycast={ignoreRaycast}>
              <cylinderGeometry args={[slot.radius, slot.radius, TRACKER_DISC_HEIGHT, 96]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={highlighted ? 0.6 : 0}
                fog={false}
                roughness={1}
                metalness={0}
              />
            </mesh>
            <group position={[0, TRACKER_DISC_HEIGHT, 0]}>
              {slot.kind === 'phase' ? (
                <PhaseSymbol symbol={symbol} radius={slot.radius} faceColor={color} highlighted={highlighted} />
              ) : null}
              {slot.kind === 'turn' ? (
                <TurnTracker
                  radius={slot.radius}
                  turn={progress.turn}
                  onSelectTurn={canInteract ? onSelectTurn : undefined}
                />
              ) : null}
              {slot.kind === 'spice' ? <SpiceSupply radius={slot.radius} /> : null}
            </group>
          </group>
        );
      })}
    </group>
  );
}

function StormSectorHighlight({ sectorIndex }: { sectorIndex: number }) {
  const loadedMarkerTexture = useTexture(stormMarkerUrl);
  const markerTexture = useMemo(() => {
    loadedMarkerTexture.colorSpace = SRGBColorSpace;
    loadedMarkerTexture.anisotropy = 8;
    loadedMarkerTexture.needsUpdate = true;
    return loadedMarkerTexture;
  }, [loadedMarkerTexture]);
  const markerGeometry = useMemo(createStormMarkerGeometry, []);
  const outlineGeometry = useMemo(() => {
    const sectorGeometry = new RingGeometry(0.72, BOARD_RADIUS, 96, 1, -STORM_SECTOR_ANGLE / 2, STORM_SECTOR_ANGLE);
    const outline = new EdgesGeometry(sectorGeometry, 15);
    sectorGeometry.dispose();
    return outline;
  }, []);
  const groupRef = useRef<Group>(null);
  const renderedSectorIndex = useRef<number | null>(null);
  const transition = useRef<StormTransition | null>(null);
  const { invalidate } = useThree();

  useFrame(() => {
    const group = groupRef.current;
    const activeTransition = transition.current;
    if (!group || !activeTransition) {
      return;
    }
    const progress = stormTransitionProgress(performance.now() - activeTransition.startedAt);
    group.rotation.y =
      activeTransition.fromRotation + (activeTransition.toRotation - activeTransition.fromRotation) * progress;
    if (progress >= 1) {
      group.rotation.y = activeTransition.toRotation;
      transition.current = null;
      return;
    }
    invalidate();
  });

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || renderedSectorIndex.current === sectorIndex) {
      return;
    }
    if (renderedSectorIndex.current === null) {
      group.rotation.y = stormRotationForSector(sectorIndex);
      renderedSectorIndex.current = sectorIndex;
      return;
    }
    transition.current = {
      startedAt: performance.now(),
      fromRotation: group.rotation.y,
      toRotation: nearestStormRotation(group.rotation.y, sectorIndex),
    };
    renderedSectorIndex.current = sectorIndex;
    invalidate();
  }, [invalidate, sectorIndex]);

  useEffect(
    () => () => {
      markerGeometry.dispose();
      outlineGeometry.dispose();
    },
    [markerGeometry, outlineGeometry]
  );

  return (
    <group ref={groupRef}>
      <mesh
        position={[0, BOARD_SURFACE_Y + 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-2}
        raycast={ignoreRaycast}
      >
        <ringGeometry args={[0.72, BOARD_RADIUS, 96, 1, -STORM_SECTOR_ANGLE / 2, STORM_SECTOR_ANGLE]} />
        <meshBasicMaterial
          color="#e13632"
          transparent
          opacity={STORM_SECTOR_FILL_OPACITY}
          depthTest
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments
        key={outlineGeometry.uuid}
        geometry={outlineGeometry}
        position={[0, BOARD_SURFACE_Y + 0.003, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={1}
        raycast={ignoreRaycast}
      >
        <lineBasicMaterial
          color="#ef5a50"
          depthTest
          depthWrite={false}
          opacity={STORM_SECTOR_OUTLINE_OPACITY}
          toneMapped={false}
          transparent
        />
      </lineSegments>
      <mesh
        key={markerGeometry.uuid}
        geometry={markerGeometry}
        renderOrder={STORM_MARKER_RENDER_ORDER}
        raycast={ignoreRaycast}
      >
        <meshBasicMaterial
          alphaTest={0.1}
          alphaToCoverage
          depthTest
          depthWrite={false}
          map={markerTexture}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function BoardSurface({
  seatCount,
  stormSectorIndex,
  tableProgress,
  trackerSlots,
  onSelectTurn,
}: {
  seatCount: TableSeatCount;
  stormSectorIndex: number;
  tableProgress?: TableProgress;
  trackerSlots: readonly TrackerArcSlot[];
  onSelectTurn?: TabletopSceneProps['onSelectTurn'];
}) {
  const loadedMapTexture = useTexture(arrakisMapUrl);
  const mapTexture = useMemo(() => {
    loadedMapTexture.colorSpace = SRGBColorSpace;
    loadedMapTexture.anisotropy = 8;
    loadedMapTexture.needsUpdate = true;
    return loadedMapTexture;
  }, [loadedMapTexture]);
  return (
    <group>
      <TableFurniture trackerSlots={trackerSlots} />
      <BoardRim seatCount={seatCount} />
      <mesh receiveShadow position={[0, BOARD_SURFACE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[BOARD_RADIUS, 128]} />
        <meshStandardMaterial map={mapTexture} roughness={0.88} metalness={0} />
      </mesh>
      <StormSectorHighlight sectorIndex={stormSectorIndex} />
      <mesh position={[0, BOARD_SURFACE_Y + 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[BOARD_RADIUS, 128]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {Array.from({ length: TABLE_SECTOR_COUNT }, (_, index) => {
        const angle = (index / TABLE_SECTOR_COUNT) * Math.PI * 2;
        const radius = BOARD_RADIUS + (BOARD_RIM_RADIUS - BOARD_RADIUS) / 2;
        return (
          <mesh
            key={index}
            position={[Math.cos(angle) * radius, BOARD_RIM_SURFACE_Y - BOARD_RIM_DEPTH / 2, Math.sin(angle) * radius]}
            rotation={[0, Math.PI / 2 - angle, 0]}
            raycast={ignoreRaycast}
          >
            <boxGeometry
              args={[
                BOARD_RIM_DIVIDER_WIDTH,
                BOARD_RIM_DEPTH + BOARD_RIM_DIVIDER_OVERLAP,
                BOARD_RIM_RADIUS - BOARD_RADIUS + 0.01,
              ]}
            />
            <meshStandardMaterial color={BOARD_RIM_DIVIDER_COLOR} roughness={0.88} metalness={0} />
          </mesh>
        );
      })}
      <PlayerStations seatCount={seatCount} />
      {tableProgress ? (
        <TableTrackers progress={tableProgress} slots={trackerSlots} onSelectTurn={onSelectTurn} />
      ) : null}
    </group>
  );
}

function zonePadAppearance(zone: Zone, selectable: boolean, hovered: boolean) {
  const isReserve = zone.kind === 'reserve';
  const padSurfaceY = isReserve ? BOARD_RIM_SURFACE_Y : surfaceHeightAt(zone.position);
  return {
    isReserve,
    decalY: padSurfaceY + SURFACE_DECAL_OFFSET - zone.position[1],
    emissiveIntensity: selectable ? (hovered ? 0.65 : 0.24) : 0,
    opacity: isReserve ? 0.54 : selectable ? 0.5 : 0.24,
    labelZ: isReserve ? 0.77 : zone.radius * 0.6,
  };
}

function ZonePad({ zone, selectable }: { zone: Zone; selectable: boolean }) {
  const { stageSelectedToZone } = useTabletop();
  const { renderer } = useThree();
  const [hovered, setHovered] = useState(false);
  const { isReserve, decalY, emissiveIntensity, opacity, labelZ } = zonePadAppearance(zone, selectable, hovered);

  return (
    <group position={zone.position}>
      <mesh
        key={`${zone.kind}:${zone.radius}`}
        receiveShadow
        position={[0, decalY, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onClick={(event) => {
          if (selectable) {
            event.stopPropagation();
            stageSelectedToZone(zone.id);
          }
        }}
        onPointerEnter={(event) => {
          event.stopPropagation();
          setHovered(true);
          renderer.domElement.style.cursor = selectable ? 'pointer' : 'default';
        }}
        onPointerLeave={() => {
          setHovered(false);
          renderer.domElement.style.cursor = 'default';
        }}
      >
        {isReserve ? (
          <planeGeometry args={[RESERVE_PAD_WIDTH, RESERVE_PAD_DEPTH]} />
        ) : (
          <circleGeometry args={[zone.radius, 64]} />
        )}
        <meshStandardMaterial
          color={zone.tone}
          emissive={selectable ? zone.tone : '#000000'}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
          roughness={0.8}
        />
      </mesh>
      {selectable ? (
        <mesh position={[0, decalY + SURFACE_DECAL_OFFSET, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[zone.radius + 0.04, zone.radius + 0.09, 64]} />
          <meshBasicMaterial color="#ffd894" transparent opacity={hovered ? 0.95 : 0.64} />
        </mesh>
      ) : null}
      <Html center position={[0, 0.42, labelZ]} zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <span className={`scene-zone-label ${selectable ? 'scene-zone-label--active' : ''}`}>{zone.shortLabel}</span>
      </Html>
    </group>
  );
}

function stackLayerFaceUp(piece: TablePiece, index: number, shownLayers: number) {
  const itemIndex = stackLayerItemIndex(piece.items.length, shownLayers, index, piece.flipRevision);
  return piece.items[itemIndex]?.faceUp ?? true;
}

function PieceFace({ height, underside, children }: { height: number; underside: boolean; children: ReactNode }) {
  return (
    <group
      position={[0, underside ? -0.001 : height + 0.001, 0]}
      rotation={[underside ? Math.PI / 2 : -Math.PI / 2, 0, 0]}
    >
      {children}
    </group>
  );
}

function TokenFace({ piece, faceUp, underside = false }: { piece: TablePiece; faceUp: boolean; underside?: boolean }) {
  return (
    <PieceFace height={FORCE_LAYER_HEIGHT} underside={underside}>
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        <circleGeometry args={[FORCE_FACE_RADIUS, 48]} />
        <meshStandardMaterial color={faceUp ? piece.accent : '#261c18'} roughness={0.5} metalness={0.08} />
      </mesh>
      {!faceUp ? (
        <mesh position={[0, 0, 0.001]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
          <ringGeometry args={[FORCE_FACE_RADIUS * 0.64, FORCE_FACE_RADIUS * 0.78, 48]} />
          <meshStandardMaterial color={piece.accent} roughness={0.5} metalness={0.08} />
        </mesh>
      ) : null}
    </PieceFace>
  );
}

function ForceStackLayers({ piece }: { piece: TablePiece }) {
  const shownLayers = visibleLayerCount(piece);
  return (
    <group>
      {Array.from({ length: shownLayers }, (_, index) => {
        const faceUp = stackLayerFaceUp(piece, index, shownLayers);
        return (
          <group key={index} position={[0, index * FORCE_LAYER_PITCH, 0]}>
            <mesh
              position={[0, FORCE_LAYER_HEIGHT / 2, 0]}
              renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
              rotation={[0, 0, faceUp ? 0 : Math.PI]}
            >
              <cylinderGeometry args={[FORCE_TOP_RADIUS, FORCE_BOTTOM_RADIUS, FORCE_LAYER_HEIGHT, 48]} />
              <meshStandardMaterial color={piece.color} roughness={0.56} metalness={0.1} />
            </mesh>
            <TokenFace piece={piece} faceUp={faceUp} />
            <TokenFace piece={piece} faceUp={!faceUp} underside />
          </group>
        );
      })}
    </group>
  );
}

function CardFace({ piece, faceUp, underside = false }: { piece: TablePiece; faceUp: boolean; underside?: boolean }) {
  return (
    <PieceFace height={CARD_LAYER_HEIGHT} underside={underside}>
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        <planeGeometry args={[CARD_WIDTH, CARD_DEPTH]} />
        <meshStandardMaterial color={faceUp ? piece.color : '#2b1a1a'} roughness={0.68} metalness={0.03} />
      </mesh>
      <mesh position={[0, 0, 0.001]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        <planeGeometry args={[0.58, 0.82]} />
        <meshBasicMaterial color={piece.accent} transparent depthWrite={false} opacity={faceUp ? 0.74 : 0.38} />
      </mesh>
    </PieceFace>
  );
}

function CardStackLayers({ piece }: { piece: TablePiece }) {
  const shownLayers = visibleLayerCount(piece);
  return (
    <group>
      {Array.from({ length: shownLayers }, (_, index) => {
        const faceUp = stackLayerFaceUp(piece, index, shownLayers);
        return (
          <group
            key={index}
            position={[(index - (shownLayers - 1) / 2) * CARD_LAYER_STAGGER, index * CARD_LAYER_PITCH, 0]}
          >
            <mesh position={[0, CARD_LAYER_HEIGHT / 2, 0]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
              <boxGeometry args={[CARD_WIDTH, CARD_LAYER_HEIGHT, CARD_DEPTH]} />
              <meshStandardMaterial color="#ead9bb" roughness={0.68} metalness={0.03} />
            </mesh>
            <CardFace piece={piece} faceUp={faceUp} />
            <CardFace piece={piece} faceUp={!faceUp} underside />
          </group>
        );
      })}
    </group>
  );
}

function MarkerLayers({ piece }: { piece: TablePiece }) {
  if (isSpicePiece(piece)) {
    return <SpiceLayers piece={piece} />;
  }
  return (
    <group rotation={[0, piece.orientation, 0]}>
      <mesh position={[0, MARKER_BASE_HEIGHT / 2, 0]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        <cylinderGeometry args={[MARKER_TOP_RADIUS, MARKER_BOTTOM_RADIUS, MARKER_BASE_HEIGHT, 8]} />
        <meshStandardMaterial color={piece.color} roughness={0.48} metalness={0.28} />
      </mesh>
      <mesh position={[0, MARKER_CONE_CENTER_Y, 0]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} rotation={[0, 0.2, 0]}>
        <coneGeometry args={[MARKER_CONE_RADIUS, MARKER_CONE_HEIGHT, 8]} />
        <meshStandardMaterial color={piece.accent} roughness={0.45} metalness={0.2} />
      </mesh>
    </group>
  );
}

function SpiceLayers({ piece }: { piece: TablePiece }) {
  return (
    <group>
      {Array.from({ length: visibleLayerCount(piece) }, (_, index) => (
        <group key={index} position={[0, index * SPICE_LAYER_PITCH, 0]}>
          <mesh position={[0, SPICE_LAYER_HEIGHT / 2, 0]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
            <cylinderGeometry args={[SPICE_TOKEN_RADIUS, SPICE_TOKEN_RADIUS, SPICE_LAYER_HEIGHT, 48]} />
            <meshStandardMaterial color="#b8842f" roughness={0.8} metalness={0} />
          </mesh>
          <mesh
            position={[0, SPICE_LAYER_HEIGHT + 0.001, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
          >
            <circleGeometry args={[SPICE_TOKEN_RADIUS * 0.79, 48]} />
            <meshStandardMaterial color="#f6d77f" roughness={1} metalness={0} />
          </mesh>
          <mesh
            position={[0, SPICE_LAYER_HEIGHT + 0.003, 0]}
            rotation={[-Math.PI / 2, 0, Math.PI / 4]}
            renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
          >
            <planeGeometry args={[0.09, 0.09]} />
            <meshBasicMaterial color="#6b431d" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

type PiecePress = {
  x: number;
  y: number;
  startedAt: number;
  pointerId: number;
  captureTarget: HTMLCanvasElement;
  onNativePointerMove: (event: PointerEvent) => void;
  onNativePointerUp: (event: PointerEvent) => void;
  onNativePointerCancel: EventListener;
  onNativeBlur: EventListener;
  session: ActivePointerSession;
};

type PiecePressOwner = {
  press: MutableRefObject<PiecePress | null>;
  dragging: MutableRefObject<boolean>;
  activePointer: MutableRefObject<ActivePointerSession | null>;
  canvas: HTMLCanvasElement;
  onPointerSessionChange(active: boolean): void;
};

function releasePiecePress(owner: PiecePressOwner, cursor: string) {
  const pressed = owner.press.current;
  owner.dragging.current = false;
  owner.press.current = null;
  if (pressed) {
    if (owner.activePointer.current === pressed.session) {
      owner.activePointer.current = null;
    }
    window.removeEventListener('pointermove', pressed.onNativePointerMove);
    window.removeEventListener('pointerup', pressed.onNativePointerUp);
    window.removeEventListener('pointercancel', pressed.onNativePointerCancel);
    window.removeEventListener('blur', pressed.onNativeBlur);
    try {
      pressed.captureTarget.releasePointerCapture(pressed.pointerId);
    } catch {
      /* The browser may already have released capture after cancellation. */
    }
  }
  owner.canvas.style.cursor = cursor;
  owner.onPointerSessionChange(false);
}

type PieceDragOperations = Pick<PiecePressOwner, 'press' | 'dragging' | 'canvas'> & {
  pieceId: string;
  beginGesture(pieceId: string, pickup: 'whole' | 'top'): void;
  updateGesture(point: Vector3Tuple): void;
  finishGesture(point: Vector3Tuple): void;
  cancelDraft(): void;
  publishPointer(point: Vector3Tuple | null): void;
  pointFromClient(x: number, y: number): Vector3Tuple | null;
  releasePress(cursor?: string): void;
  abortPress(): void;
};

function startPieceDrag(operations: PieceDragOperations, event: PointerEvent): boolean {
  const pressed = operations.press.current;
  if (!pressed || event.pointerId !== pressed.pointerId) {
    return false;
  }
  if (operations.dragging.current) {
    return true;
  }
  const distance = Math.hypot(event.clientX - pressed.x, event.clientY - pressed.y);
  if (distance < 4) {
    return false;
  }
  const pickup = event.timeStamp - pressed.startedAt >= STACK_HOLD_MS ? 'whole' : 'top';
  operations.beginGesture(operations.pieceId, pickup);
  operations.dragging.current = true;
  operations.canvas.style.cursor = 'grabbing';
  return true;
}

function movePiecePress(operations: PieceDragOperations, event: PointerEvent) {
  if (!isPublicTablePoint(operations.canvas, event.clientX, event.clientY)) {
    operations.abortPress();
    operations.publishPointer(null);
    return;
  }
  if (!startPieceDrag(operations, event)) {
    return;
  }
  const point = operations.pointFromClient(event.clientX, event.clientY);
  if (point) {
    operations.updateGesture(point);
  }
}

function finishPiecePress(operations: PieceDragOperations, event: PointerEvent) {
  const pressed = operations.press.current;
  if (event.button !== 0 || !pressed) {
    return;
  }
  if (event.pointerId !== pressed.pointerId) {
    return;
  }
  const wasDragging = startPieceDrag(operations, event);
  const point = wasDragging ? operations.pointFromClient(event.clientX, event.clientY) : null;
  operations.releasePress('grab');
  if (wasDragging) {
    if (point) {
      operations.finishGesture(point);
    } else {
      operations.cancelDraft();
      operations.publishPointer(null);
    }
  }
  operations.canvas.style.cursor = 'grab';
}

function capturePiecePress(
  operations: PieceDragOperations,
  activePointer: MutableRefObject<ActivePointerSession | null>,
  event: PointerEvent
) {
  const pointerId = event.pointerId;
  const session: ActivePointerSession = { pieceId: operations.pieceId, pointerId };
  const onNativePointerMove = (nativeEvent: PointerEvent) => movePiecePress(operations, nativeEvent);
  const onNativePointerUp = (nativeEvent: PointerEvent) => finishPiecePress(operations, nativeEvent);
  const onNativePointerCancel: EventListener = (nativeEvent) => {
    if (nativeEvent instanceof PointerEvent && nativeEvent.pointerId === pointerId) {
      operations.abortPress();
    }
  };
  const onNativeBlur: EventListener = () => operations.abortPress();
  operations.press.current = {
    x: event.clientX,
    y: event.clientY,
    startedAt: event.timeStamp,
    pointerId,
    captureTarget: operations.canvas,
    onNativePointerMove,
    onNativePointerUp,
    onNativePointerCancel,
    onNativeBlur,
    session,
  };
  activePointer.current = session;
  window.addEventListener('pointermove', onNativePointerMove);
  window.addEventListener('pointerup', onNativePointerUp);
  window.addEventListener('pointercancel', onNativePointerCancel);
  window.addEventListener('blur', onNativeBlur);
  operations.canvas.setPointerCapture(pointerId);
}

type TablePieceMeshProps = {
  piece: TablePiece;
  interaction: 'select' | 'drag' | 'hybrid';
  activePointer: MutableRefObject<ActivePointerSession | null>;
  onPointerSessionChange(active: boolean): void;
};

function usePieceCarryState(piece: TablePiece) {
  const { state, gestureActivePieceId } = useTabletop();
  const { canInteract, remoteCarriedIds, reservedPieceIds } = usePresence();
  const drafted = state.draftMove?.pieceId === piece.id;
  const remoteCarried = remoteCarriedIds.has(piece.id);
  const locallyCarried = drafted && gestureActivePieceId !== null;
  const reserved = reservedPieceIds.has(piece.id);
  const localSource = state.draftMove?.sourcePieceId === piece.id;
  return {
    drafted,
    remoteCarried,
    locallyCarried,
    reserved,
    interactionBlocked: !canInteract || remoteCarried || (reserved && !localSource),
  };
}

function useEscapeKey(onEscape: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onEscape();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onEscape]);
}

function usePiecePressLifecycle({
  activePointer,
  onPointerSessionChange,
}: Pick<TablePieceMeshProps, 'activePointer' | 'onPointerSessionChange'>) {
  const { state, cancelDraft } = useTabletop();
  const { canInteract } = usePresence();
  const { renderer } = useThree();
  const dragging = useRef(false);
  const press = useRef<PiecePress | null>(null);
  const releasePress = useCallback(
    (cursor = 'default') => {
      releasePiecePress(
        { press, dragging, activePointer, canvas: renderer.domElement, onPointerSessionChange },
        cursor
      );
    },
    [activePointer, onPointerSessionChange, renderer.domElement]
  );

  const abortPress = useCallback(() => {
    const wasDragging = dragging.current;
    releasePress();
    if (wasDragging) {
      cancelDraft();
    }
  }, [cancelDraft, releasePress]);

  useEffect(() => {
    if (!canInteract && press.current) {
      abortPress();
    }
  }, [abortPress, canInteract]);

  useEffect(
    () => () => {
      if (press.current || dragging.current) {
        releasePress();
        cancelDraft();
      }
    },
    [cancelDraft, releasePress]
  );

  useEffect(() => {
    if (!state.draftMove && dragging.current) {
      releasePress();
    }
  }, [releasePress, state.draftMove]);

  const cancelPress = useCallback(() => {
    if (press.current) {
      releasePress();
      cancelDraft();
    }
  }, [cancelDraft, releasePress]);
  useEscapeKey(cancelPress);

  return { press, dragging, releasePress, abortPress };
}

function useTablePointFromClient(piece: TablePiece) {
  const { camera, renderer } = useThree();
  const normalizedPointer = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointFromClient = useCallback(
    (clientX: number, clientY: number): Vector3Tuple | null => {
      if (!isPublicTablePoint(renderer.domElement, clientX, clientY)) {
        return null;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      normalizedPointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(normalizedPointer, camera);
      return pointOnPieceDragRay(
        piece,
        [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
        [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z]
      );
    },
    [camera, normalizedPointer, piece, raycaster, renderer.domElement]
  );

  return pointFromClient;
}

function pieceHoverCursor(
  interaction: TabletopSceneProps['interaction'],
  canInteract: boolean,
  interactionBlocked: boolean,
  gestureBlocked: boolean
) {
  if (interactionBlocked) {
    return canInteract ? 'not-allowed' : 'default';
  }
  return interaction === 'select' ? 'pointer' : gestureBlocked ? 'not-allowed' : 'grab';
}

function usePiecePointerEvents(
  { piece, interaction, activePointer, onPointerSessionChange }: TablePieceMeshProps,
  interactionBlocked: boolean
) {
  const { state, selectPiece, setHoveredPiece, beginGesture, updateGesture, finishGesture, cancelDraft } =
    useTabletop();
  const { canInteract, publishPointer } = usePresence();
  const { renderer } = useThree();
  const { press, dragging, releasePress, abortPress } = usePiecePressLifecycle({
    activePointer,
    onPointerSessionChange,
  });
  const pointFromClient = useTablePointFromClient(piece);
  const gestureBlocked = interaction !== 'select' ? gestureBlockReason(state, piece) : null;

  return {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
    },
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0 || interactionBlocked) {
        return;
      }
      event.stopPropagation();
      if (activePointer.current) {
        return;
      }
      selectPiece(piece.id);
      if (interaction === 'select' || gestureBlocked) {
        return;
      }
      onPointerSessionChange(true);
      capturePiecePress(
        {
          pieceId: piece.id,
          press,
          dragging,
          canvas: renderer.domElement,
          beginGesture,
          updateGesture,
          finishGesture,
          cancelDraft,
          publishPointer,
          pointFromClient,
          releasePress,
          abortPress,
        },
        activePointer,
        event.nativeEvent
      );
    },
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      const cursor = pieceHoverCursor(interaction, canInteract, interactionBlocked, Boolean(gestureBlocked));
      if (interactionBlocked) {
        renderer.domElement.style.cursor = cursor;
        return;
      }
      setHoveredPiece(piece.id);
      renderer.domElement.style.cursor = cursor;
    },
    onPointerLeave: () => {
      setHoveredPiece(null);
      if (!dragging.current) {
        renderer.domElement.style.cursor = 'default';
      }
    },
  };
}

const PIECE_SELECTION_RADII: Record<TablePiece['kind'], [number, number, number]> = {
  card: [0.7, 0.78, 64],
  force: [0.2, 0.235, 64],
  marker: [0.4, 0.47, 64],
};

function PieceSelectionRing({
  piece,
  shadowLocalY,
  stackTargeted,
  drafted,
}: {
  piece: TablePiece;
  shadowLocalY: number;
  stackTargeted: boolean;
  drafted: boolean;
}) {
  return (
    <mesh
      position={[0, shadowLocalY + CONTACT_SHADOW_EPSILON, 0]}
      renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={isSpicePiece(piece) ? [0.18, 0.205, 64] : PIECE_SELECTION_RADII[piece.kind]} />
      <meshBasicMaterial
        color={stackTargeted ? '#f6bd55' : drafted ? '#f6c879' : '#fff0c9'}
        transparent
        opacity={0.92}
      />
    </mesh>
  );
}

function PieceLayers({ piece }: { piece: TablePiece }) {
  if (piece.kind === 'marker') {
    return <MarkerLayers piece={piece} />;
  }
  return piece.kind === 'card' ? <CardStackLayers piece={piece} /> : <ForceStackLayers piece={piece} />;
}

function PieceLock({ piece }: { piece: TablePiece }) {
  if (!piece.locked) {
    return null;
  }
  const lock = (
    <mesh position={[0.3, 0.42, 0.2]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
      <boxGeometry args={[0.16, 0.19, 0.09]} />
      <meshStandardMaterial color="#251912" metalness={0.3} roughness={0.6} />
    </mesh>
  );
  return piece.kind === 'force' ? <group scale={0.5}>{lock}</group> : lock;
}

function PieceBadge({
  piece,
  selected,
  labelRef,
  badgeRef,
}: { piece: TablePiece; selected: boolean } & Pick<ReturnType<typeof usePieceFlipAnimation>, 'labelRef' | 'badgeRef'>) {
  return (
    <group ref={labelRef} position={[0, pieceLabelHeight(piece), 0]}>
      <Html center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <span
          ref={badgeRef}
          className={`scene-piece-count ${selected ? 'scene-piece-count--selected' : ''}`}
          data-piece-id={piece.id}
          data-face-up={topItemFaceUp(piece)}
          data-flip-revision={piece.flipRevision ?? 0}
          data-flipping="false"
        >
          {pieceCount(piece)}
        </span>
      </Html>
    </group>
  );
}

function TablePieceMesh(props: TablePieceMeshProps) {
  const { piece } = props;
  const { state, renderedPositionFor, renderedOrientationFor, finishPieceFlip } = useTabletop();
  const { drafted, remoteCarried, locallyCarried, reserved, interactionBlocked } = usePieceCarryState(piece);
  const pointerEvents = usePiecePointerEvents(props, interactionBlocked);
  const selected = state.selectedPieceId === piece.id;
  const stackTargeted = state.draftMove?.targetPieceId === piece.id;
  const displayedCount = pieceCount(piece);
  const emptyProjection = displayedCount === 0;
  const position = renderedPositionFor(piece);
  const orientation = renderedOrientationFor(piece);
  const carried = locallyCarried || remoteCarried;
  const poseRef = useTablePose(position, orientation, remoteCarried, locallyCarried);
  const { pivotRef, labelRef, shadowRef, badgeRef } = usePieceFlipAnimation(
    piece,
    drafted || remoteCarried || emptyProjection,
    finishPieceFlip
  );
  const flipPivotY = stackTopHeight(piece) / 2;
  const footprint = { ...piece, orientation };
  const shadowLocalY = contactShadowHeightAt(position, footprint) - position[1];

  return (
    <group
      ref={poseRef}
      userData={{
        duneTablePiece: {
          id: piece.id,
          count: displayedCount,
          itemIds: piece.items.map((item) => item.id),
          localCarried: locallyCarried,
          remoteCarried,
          reserved,
        },
      }}
      {...pointerEvents}
    >
      {!emptyProjection ? (
        <>
          <group ref={shadowRef}>
            <Shadow
              color="#100906"
              colorStop={0.18}
              opacity={contactShadowOpacity(carried)}
              position={[0, shadowLocalY, 0]}
              renderOrder={1}
              scale={contactShadowScale(piece, carried)}
              raycast={ignoreRaycast}
            />
          </group>
          {selected || stackTargeted ? (
            <PieceSelectionRing
              piece={piece}
              shadowLocalY={shadowLocalY}
              stackTargeted={stackTargeted}
              drafted={drafted}
            />
          ) : null}
          <group ref={pivotRef} position={[0, flipPivotY, 0]}>
            <group position={[0, -flipPivotY, 0]}>
              <PieceLayers piece={piece} />
            </group>
          </group>
          <PieceLock piece={piece} />
          <PieceBadge piece={piece} selected={selected} labelRef={labelRef} badgeRef={badgeRef} />
        </>
      ) : null}
    </group>
  );
}

function useReportedInteractionSession(onInteractionActiveChange: TabletopSceneProps['onInteractionActiveChange']) {
  const [active, setActive] = useState(false);
  const onChange = useCallback(
    (nextActive: boolean) => {
      setActive(nextActive);
      if (nextActive) {
        onInteractionActiveChange?.(true);
      }
    },
    [onInteractionActiveChange]
  );
  return { active, onChange };
}

function useSceneInteractions(onInteractionActiveChange: TabletopSceneProps['onInteractionActiveChange']) {
  const { gestureActivePieceId } = useTabletop();
  const pointer = useReportedInteractionSession(onInteractionActiveChange);
  const orbit = useReportedInteractionSession(onInteractionActiveChange);
  const sceneInteractionActive = pointer.active || orbit.active || gestureActivePieceId !== null;

  useEffect(() => {
    onInteractionActiveChange?.(sceneInteractionActive);
  }, [onInteractionActiveChange, sceneInteractionActive]);
  useEffect(() => () => onInteractionActiveChange?.(false), [onInteractionActiveChange]);

  return {
    controlsEnabled: !gestureActivePieceId && !pointer.active,
    onPointerSessionChange: pointer.onChange,
    onOrbitSessionChange: orbit.onChange,
  };
}

function SceneContents({
  mode,
  interaction,
  cameraView = DEFAULT_CAMERA_VIEW,
  focusZoneId,
  onInteractionActiveChange,
  seatCount = DEFAULT_TABLE_SEAT_COUNT,
  tableProgress,
  trackerSlots,
  mapFramingPoints,
  onSelectTurn,
  extras,
}: Pick<
  TabletopSceneProps,
  | 'mode'
  | 'interaction'
  | 'cameraView'
  | 'focusZoneId'
  | 'onInteractionActiveChange'
  | 'seatCount'
  | 'tableProgress'
  | 'onSelectTurn'
  | 'extras'
> & {
  trackerSlots: readonly TrackerArcSlot[];
  mapFramingPoints: readonly Vector3Tuple[];
}) {
  const { state, affordances, renderedPieces, selectPiece, cancelDraft } = useTabletop();
  const activePointer = useRef<ActivePointerSession | null>(null);
  const { controlsEnabled, onPointerSessionChange, onOrbitSessionChange } =
    useSceneInteractions(onInteractionActiveChange);
  const moveAffordance = affordances.find((affordance) => affordance.commandType === 'piece.move');
  const targetZoneIds = new Set(moveAffordance?.targetZoneIds ?? []);
  const focusZone = zoneById(focusZoneId ?? null);
  const cameraTarget: Vector3Tuple = focusZone ? [focusZone.position[0], 0.1, focusZone.position[2]] : [0, 0.1, 0];
  useEscapeKey(cancelDraft);

  return (
    <>
      <color attach="background" args={[mode === 'seated' ? '#130d0a' : '#1b120d']} />
      <fog attach="fog" args={['#130d0a', 10, 22]} />
      <CameraRelativeFog />
      <ScenePresence />
      <ambientLight intensity={1.25} />
      <directionalLight position={[-4, 9, 5]} intensity={3.1} color="#ffe2ae" />
      <pointLight position={[5, 4, -4]} intensity={14} distance={16} color="#d67b44" />
      <group onClick={() => selectPiece(null)}>
        <BoardSurface
          seatCount={seatCount}
          stormSectorIndex={state.stormSectorIndex}
          tableProgress={tableProgress}
          trackerSlots={trackerSlots}
          onSelectTurn={onSelectTurn}
        />
        {interaction !== 'drag'
          ? ZONES.map((zone) => <ZonePad key={zone.id} zone={zone} selectable={targetZoneIds.has(zone.id)} />)
          : null}
        {renderedPieces.map((piece) => (
          <TablePieceMesh
            key={piece.id}
            piece={piece}
            interaction={interaction}
            activePointer={activePointer}
            onPointerSessionChange={onPointerSessionChange}
          />
        ))}
        {extras}
      </group>
      <CameraControls
        mode={mode}
        enabled={controlsEnabled}
        target={cameraTarget}
        cameraView={cameraView}
        mapFramingPoints={mapFramingPoints}
        onControlSessionChange={onOrbitSessionChange}
      />
    </>
  );
}

export function TabletopScene({
  mode,
  interaction,
  className,
  cameraView = DEFAULT_CAMERA_VIEW,
  focusZoneId = null,
  onInteractionActiveChange,
  seatCount = DEFAULT_TABLE_SEAT_COUNT,
  tableProgress,
  onSelectTurn,
  extras,
}: TabletopSceneProps) {
  const { takeAdditionalFromTarget } = useTabletop();
  const orthographic = mode === 'tactical';
  const focusZone = zoneById(focusZoneId);
  const focusX = focusZone?.position[0] ?? 0;
  const focusZ = focusZone?.position[2] ?? 0;
  const phaseCount = tableProgress?.phases.length ?? null;
  const trackerSlots = useMemo(() => (phaseCount === null ? [] : trackerArcSlots(phaseCount)), [phaseCount]);
  const mapFramingPoints = useMemo(() => mapViewFramingPoints(trackerSlots, seatCount), [seatCount, trackerSlots]);
  const camera = useMemo(
    () =>
      orthographic
        ? { position: [0, 10, 0.01] as Vector3Tuple, zoom: 66, near: 0.1, far: 100 }
        : mode === 'seated'
          ? {
              position: cameraPoseFor('map', 1, mapFramingPoints).position,
              fov: TABLE_CAMERA_FIELD_OF_VIEW,
              near: 0.1,
              far: 100,
            }
          : {
              position: [focusX + 7.6, 9.4, focusZ + 7.6] as Vector3Tuple,
              fov: 45,
              near: 0.1,
              far: 100,
            },
    [focusX, focusZ, mapFramingPoints, mode, orthographic]
  );

  return (
    <div
      className={className}
      data-scene-mode={mode}
      onContextMenu={(event) => {
        event.preventDefault();
        takeAdditionalFromTarget();
      }}
    >
      <Canvas
        key={`${mode}-${focusZoneId ?? 'table'}`}
        orthographic={orthographic}
        camera={camera}
        dpr={[1, 1.75]}
        frameloop="demand"
        renderer={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
      >
        <SceneContents
          mode={mode}
          interaction={interaction}
          cameraView={cameraView}
          focusZoneId={focusZoneId}
          onInteractionActiveChange={onInteractionActiveChange}
          seatCount={seatCount}
          tableProgress={tableProgress}
          onSelectTurn={onSelectTurn}
          trackerSlots={trackerSlots}
          mapFramingPoints={mapFramingPoints}
          extras={extras}
        />
      </Canvas>
    </div>
  );
}
