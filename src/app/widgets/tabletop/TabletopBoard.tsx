/* @jsxImportSource ./three-jsx */
import { useTexture } from '@react-three/drei/webgpu';
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import type { GameSnapshot } from '@shared/play/protocol';
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
} from '@shared/play/stormSector';
import {
  BOARD_RADIUS,
  BOARD_RIM_RADIUS,
  BOARD_RIM_SURFACE_Y,
  BOARD_SURFACE_Y,
  CONTACT_SHADOW_EPSILON,
  TABLE_SURFACE_Y,
} from '@shared/play/tableGeometry';
import { PLAYER_RING_RADIUS, tableSeatAngles, TABLE_SECTOR_COUNT } from '@shared/play/tableSettings';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { TRACKER_DISC_HEIGHT } from '@shared/play/tableTrackers';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { lazy, Suspense, useMemo, useRef, useLayoutEffect, useEffect } from 'react';
import type { ExtrudeGeometry, Group } from 'three';
import { BufferGeometry, EdgesGeometry, Float32BufferAttribute, RingGeometry, SRGBColorSpace } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import { ArtworkPending } from './ArtworkPending';
import arrakisMapSvg from './assets/arrakis-map.svg?raw';
import stormMarkerUrl from './assets/storm-marker.webp?url';
import { boardFurnitureFor } from './boardFurniture';
import { boardMapGeometry } from './boardMapGeometry';
import {
  BOARD_RIM_COLOR,
  BOARD_RIM_DEPTH,
  BOARD_RIM_METALNESS,
  BOARD_RIM_ROUGHNESS,
  createBoardRimShape,
} from './boardRimGeometry';
import { ignoreRaycast } from './ignoreRaycast';
import { PhaseSymbol } from './PhaseSymbol';
import { useSharedMeshes } from './sharedMeshes';
import { SoftShadow } from './SoftShadow';
import { TableFurniture } from './TableFurniture';
import { activePhaseIndex, trackerDiscColor } from './tableTrackers';
import type { TableProgress } from './tableTrackers';
import { TurnTracker } from './TurnTracker';
const SpiceBank = lazy(() => import('./SpiceBank').then((module) => ({ default: module.SpiceBank })));
useTexture.preload(stormMarkerUrl);

/* Under the map's own shapes, the colour of its outer ring, and how far above the disc the shapes lie. */
const BOARD_MAP_BASE_COLOR = '#000000';
const BOARD_MAP_LIFT = 0.001;
const BOARD_RIM_DIVIDER_COLOR = '#050505';
const BOARD_RIM_SHADOW_SPREAD = 0.2;
const BOARD_RIM_DIVIDER_OVERLAP = 0.002;
const BOARD_RIM_DIVIDER_WIDTH = 0.035;
const BOARD_RIM_EXTRUDE_OPTIONS = {
  bevelEnabled: false,
  curveSegments: 64,
  depth: BOARD_RIM_DEPTH,
  steps: 1,
} as const;

type StormTransition = {
  startedAt: number;
  fromRotation: number;
  toRotation: number;
};

const STORM_MARKER_HOVER_Y = BOARD_SURFACE_Y + CONTACT_SHADOW_EPSILON;
const BOARD_MAP_RENDER_ORDER = -3;
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
          <group key={index} position={position} userData={{ duneTableStation: index }}>
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

/* The board's rim stands above the table, so it casts a soft ring of shadow onto it. */
function BoardRimShadow() {
  return (
    <SoftShadow
      radius={BOARD_RIM_RADIUS}
      spread={BOARD_RIM_SHADOW_SPREAD}
      y={TABLE_SURFACE_Y + 0.001}
      opacity={0.4}
      size={1024}
    />
  );
}

function TableTrackers({
  progress,
  slots,
  interactive,
}: {
  progress: TableProgress;
  slots: readonly TrackerArcSlot[];
  interactive: boolean;
}) {
  const meshes = useSharedMeshes();
  const currentPhaseIndex = activePhaseIndex(progress);

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
            <mesh
              key={slot.radius}
              receiveShadow
              position={[0, TRACKER_DISC_HEIGHT / 2, 0]}
              raycast={ignoreRaycast}
              geometry={meshes.cylinder(slot.radius, slot.radius, TRACKER_DISC_HEIGHT, 96)}
            >
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
                <TurnTracker radius={slot.radius} turn={progress.turn} lastTurn={progress.lastTurn} />
              ) : null}
              {slot.kind === 'spice' ? (
                interactive ? (
                  <Suspense
                    fallback={<PhaseSymbol symbol="/vector/icon/spice.svg" radius={slot.radius} faceColor={color} />}
                  >
                    <SpiceBank radius={slot.radius} />
                  </Suspense>
                ) : (
                  <PhaseSymbol symbol="/vector/icon/spice.svg" radius={slot.radius} faceColor={color} />
                )
              ) : null}
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
  const invalidate = useThree((state) => state.invalidate);

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
        {/* See-through, so it draws after the map, which writes no depth either. */}
        <meshBasicMaterial
          alphaTest={0.1}
          alphaToCoverage
          depthTest
          depthWrite={false}
          map={markerTexture}
          toneMapped={false}
          transparent
        />
      </mesh>
    </group>
  );
}

function BoardMap({ animate = false }: { animate?: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const group = useRef<Group>(null);
  const motion = useMotionAllowed();
  const elapsed = useRef(0);
  useFrame((_, delta) => {
    elapsed.current += delta;
    if (group.current) {
      const progress = animate && motion ? Math.min(1, elapsed.current / 0.65) : 1;
      group.current.scale.setScalar(1 - (1 - progress) ** 3);
      if (progress < 1) {
        invalidate();
      }
    }
  });
  const mapGeometry = useMemo(() => boardMapGeometry(arrakisMapSvg, BOARD_RADIUS), []);
  useEffect(() => () => mapGeometry.dispose(), [mapGeometry]);
  return (
    <group ref={group} scale={animate && motion ? 0 : 1}>
      <mesh receiveShadow position={[0, BOARD_SURFACE_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={ignoreRaycast}>
        <circleGeometry args={[BOARD_RADIUS, 128]} />
        <meshStandardMaterial color={BOARD_MAP_BASE_COLOR} roughness={0.88} metalness={0} />
      </mesh>
      {/*
        The map's shapes paint over one another in the source's order, so they write no depth; the disc below holds the board's depth.
        It draws first among the see-through things, so the storm's sector and every other overlay land on it.
      */}
      <mesh
        receiveShadow
        geometry={mapGeometry}
        renderOrder={BOARD_MAP_RENDER_ORDER}
        position={[0, BOARD_SURFACE_Y + BOARD_MAP_LIFT, 0]}
        raycast={ignoreRaycast}
      >
        <meshStandardMaterial vertexColors transparent depthWrite={false} roughness={0.88} metalness={0} />
      </mesh>
    </group>
  );
}

export function TabletopBoard({
  seatCount,
  stormSectorIndex,
  stage,
  mapVisible,
  tableProgress,
  trackerSlots,
  interactive = false,
}: {
  seatCount: TableSeatCount;
  stormSectorIndex?: number;
  stage: GameSnapshot['stage'];
  mapVisible?: boolean;
  tableProgress?: TableProgress;
  trackerSlots: readonly TrackerArcSlot[];
  interactive?: boolean;
}) {
  const meshes = useSharedMeshes();
  return (
    <group>
      <TableFurniture trackerSlots={trackerSlots} />
      <BoardRim seatCount={seatCount} />
      <BoardRimShadow />
      {/* The textured parts suspend while their image loads; the boundary keeps that inside the scene, so the
          rim, the furniture and the pieces stay on screen and the map fills in, instead of the route's
          placeholder replacing a table the visitor has already seen. While it waits it counts as unsettled artwork. */}
      {(stage !== 'setup' || mapVisible) && <BoardMap animate={stage === 'setup'} />}
      <Suspense fallback={<ArtworkPending />}>
        {boardFurnitureFor(stage).storm && stormSectorIndex !== undefined && (
          <StormSectorHighlight sectorIndex={stormSectorIndex} />
        )}
      </Suspense>
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
            geometry={meshes.box(
              BOARD_RIM_DIVIDER_WIDTH,
              BOARD_RIM_DEPTH + BOARD_RIM_DIVIDER_OVERLAP,
              BOARD_RIM_RADIUS - BOARD_RADIUS + 0.01
            )}
          >
            <meshStandardMaterial color={BOARD_RIM_DIVIDER_COLOR} roughness={0.88} metalness={0} />
          </mesh>
        );
      })}
      <PlayerStations seatCount={seatCount} />
      {tableProgress ? <TableTrackers progress={tableProgress} slots={trackerSlots} interactive={interactive} /> : null}
    </group>
  );
}
