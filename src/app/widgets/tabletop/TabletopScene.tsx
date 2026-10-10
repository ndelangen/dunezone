/* @jsxImportSource ./three-jsx */
import { Shadow, useTexture } from "@react-three/drei/webgpu";
import { Canvas, useFrame, useThree } from "@react-three/fiber/webgpu";
import type { ThreeEvent } from "@react-three/fiber/webgpu";
import { isFactionToken } from "@shared/play/factionToken";
import { gestureBlockReason, pieceCount } from "@shared/play/model";
import type { TablePiece, TableState, Vector3Tuple } from "@shared/play/model";
import { peekersOf } from "@shared/play/peeking";
import {
  CARD_LAYER_STAGGER,
  stackLayerItemIndex,
} from "@shared/play/pieceFlip";
import type { GameSnapshot } from "@shared/play/protocol";
import {
  isSpicePiece,
  SPICE_LAYER_HEIGHT,
  SPICE_LAYER_PITCH,
  SPICE_TOKEN_RADIUS,
} from "@shared/play/spice";
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
} from "@shared/play/stormSector";
import { pointOnPieceDragRay } from "@shared/play/tableDragGeometry";
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
  TROOP_BOTTOM_RADIUS,
  TROOP_FACE_RADIUS,
  tokenBoxRatio,
  TROOP_LAYER_HEIGHT,
  TROOP_LAYER_PITCH,
  TROOP_TOP_RADIUS,
  troopScale,
  MARKER_BASE_HEIGHT,
  MARKER_BOTTOM_RADIUS,
  MARKER_CONE_CENTER_Y,
  MARKER_CONE_HEIGHT,
  MARKER_CONE_RADIUS,
  MARKER_TOP_RADIUS,
  stackTopHeight,
  visibleLayerCount,
} from "@shared/play/tableGeometry";
import {
  DEFAULT_TABLE_SEAT_COUNT,
  PLAYER_RING_RADIUS,
  tableSeatAngles,
  TABLE_SECTOR_COUNT,
} from "@shared/play/tableSettings";
import type { TableSeatCount } from "@shared/play/tableSettings";
import {
  trackerArcSlots,
  TRACKER_DISC_HEIGHT,
} from "@shared/play/tableTrackers";
import type { TrackerArcSlot } from "@shared/play/tableTrackers";
import { isTroopStack } from "@shared/play/troop";
import {
  createContext,
  memo,
  lazy,
  useContext,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { ExtrudeGeometry, Group, Texture } from "three";
import {
  BufferGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  NeutralToneMapping,
  Raycaster,
  RingGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
} from "three";

import { useMotionAllowed } from "@app/styles/motion";

import { subscribeArtworkLoads, unsettledArtworkLoads } from "./artworkLoads";
import { ArtworkPending } from "./ArtworkPending";
import arrakisMapSvg from "./assets/arrakis-map.svg?raw";
import stormMarkerUrl from "./assets/storm-marker.png?url";
import { boardFurnitureFor } from "./boardFurniture";
import { boardMapGeometry } from "./boardMapGeometry";
import { BOARD_RIM_DEPTH, createBoardRimShape } from "./boardRimGeometry";
import { swallowLift, watchLongPress } from "./longPress";
import { MapPreviewCamera } from "./MapPreviewCamera";
import { peekableToken } from "./peekableToken";
import { PhaseSymbol } from "./PhaseSymbol";
import { topFaceHref } from "./pieceFaceHref";
import {
  cameraPoseFor,
  TABLE_CAMERA_FAR,
  TABLE_CAMERA_FIELD_OF_VIEW,
  TABLE_CAMERA_NEAR,
} from "./playView";
import type { CameraViewCommand } from "./playView";
import { usePointerSession } from "./PointerSessionContext";
import { sharedPublishedFaces } from "./publishedFaceRetry";
import { SpiceBank } from "./SpiceBank";
import { TableFurniture } from "./TableFurniture";
import {
  TableGraphicsBoundary,
  TableGraphicsUnavailable,
} from "./TableGraphicsBoundary";
import { useTableLighting } from "./tableLighting";
import { mapViewFramingPoints } from "./tablePlateGeometry";
import { isPublicTablePoint } from "./tablePointerPoint";
import {
  useTabletop,
  useTabletopActions,
  useTabletopCommands,
  useTabletopSelector,
} from "./TabletopContext";
import type { TabletopContextValue } from "./TabletopContext";
import styles from "./TabletopScene.module.css";
import type { PieceMenuAnchor } from "./TabletopTools";
import { activePhaseIndex, trackerDiscColor } from "./tableTrackers";
import type { TableProgress } from "./tableTrackers";
import { TurnTracker } from "./TurnTracker";
import { useDeckShuffleAnimation } from "./useDeckShuffleAnimation";
import { usePieceFlipAnimation } from "./usePieceFlipAnimation";
import { useTableGraphics } from "./useTableGraphics";
import { useTablePose } from "./useTablePose";

/* The storm marker starts with the bundle, alongside the connection. */
useTexture.preload(stormMarkerUrl);

type TabletopSceneProps = {
  children?: ReactNode;
  className?: string;
  cameraView?: CameraViewCommand;
  onInteractionActiveChange?(active: boolean): void;
  seatCount?: TableSeatCount;
  tableProgress?: TableProgress;
  /* Called when the renderer is ready to draw, the moment there is a table to open the shell onto. */
  onSceneReady?(): void;
  onSceneUnavailable?(): void;
  presentation?: "play" | "preview";
  /* Absent on the fixture, which has no lifecycle. */
  stage?: GameSnapshot["stage"];
  mapVisible?: boolean;
};

const PieceBadge = lazy(() =>
  import("./PieceBadge").then((module) => ({ default: module.PieceBadge })),
);
const HandCountChip = lazy(() =>
  import("./HandCountChip").then((module) => ({
    default: module.HandCountChip,
  })),
);
const ScenePresence = lazy(() =>
  import("./ScenePresence").then((module) => ({
    default: module.ScenePresence,
  })),
);
const PredictionOverlay = lazy(() =>
  import("./prediction/PredictionOverlay").then((module) => ({
    default: module.PredictionOverlay,
  })),
);
const TabletopTools = lazy(() =>
  import("./TabletopTools").then((module) => ({
    default: module.TabletopTools,
  })),
);
const PlayCamera = lazy(() =>
  import("./PlayCamera").then((module) => ({ default: module.PlayCamera })),
);

const BOARD_RIM_COLOR = "#15263b";
/* Under the map's own shapes, the colour of its outer ring, and how far above the disc the shapes lie. */
const BOARD_MAP_BASE_COLOR = "#000000";
const BOARD_MAP_LIFT = 0.001;
const BOARD_RIM_DIVIDER_COLOR = "#050505";
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
const DEFAULT_CAMERA_VIEW: CameraViewCommand = { view: "map", revision: 0 };

function ignoreRaycast() {
  /* Decorative scene geometry must never compete with tabletop interaction. */
}

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
    "position",
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
      3,
    ),
  );
  geometry.setAttribute(
    "uv",
    new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
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
          <group
            key={index}
            position={position}
            userData={{ duneTableStation: index }}
          >
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
    () =>
      [shape, BOARD_RIM_EXTRUDE_OPTIONS] as ConstructorParameters<
        typeof ExtrudeGeometry
      >,
    [shape],
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
      <meshStandardMaterial
        color={BOARD_RIM_COLOR}
        roughness={BOARD_RIM_ROUGHNESS}
        metalness={BOARD_RIM_METALNESS}
      />
    </mesh>
  );
}

function TableTrackers({
  progress,
  slots,
}: {
  progress: TableProgress;
  slots: readonly TrackerArcSlot[];
}) {
  const currentPhaseIndex = activePhaseIndex(progress);

  return (
    <group>
      {slots.map((slot) => {
        const symbol =
          slot.phaseIndex === null
            ? undefined
            : progress.phases[slot.phaseIndex]?.symbol;
        const highlighted =
          slot.kind === "phase" && slot.phaseIndex === currentPhaseIndex;
        const color = trackerDiscColor(slot, currentPhaseIndex);
        return (
          <group
            key={
              slot.kind === "phase"
                ? progress.phases[slot.phaseIndex ?? 0]?.id
                : slot.kind
            }
            position={slot.position}
          >
            <mesh
              key={slot.radius}
              receiveShadow
              position={[0, TRACKER_DISC_HEIGHT / 2, 0]}
              raycast={ignoreRaycast}
            >
              <cylinderGeometry
                args={[slot.radius, slot.radius, TRACKER_DISC_HEIGHT, 96]}
              />
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
              {slot.kind === "phase" ? (
                <PhaseSymbol
                  symbol={symbol}
                  radius={slot.radius}
                  faceColor={color}
                  highlighted={highlighted}
                />
              ) : null}
              {slot.kind === "turn" ? (
                <TurnTracker radius={slot.radius} turn={progress.turn} />
              ) : null}
              {slot.kind === "spice" ? (
                <SpiceBank radius={slot.radius} />
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
    const sectorGeometry = new RingGeometry(
      0.72,
      BOARD_RADIUS,
      96,
      1,
      -STORM_SECTOR_ANGLE / 2,
      STORM_SECTOR_ANGLE,
    );
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
    const progress = stormTransitionProgress(
      performance.now() - activeTransition.startedAt,
    );
    group.rotation.y =
      activeTransition.fromRotation +
      (activeTransition.toRotation - activeTransition.fromRotation) * progress;
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
    [markerGeometry, outlineGeometry],
  );

  return (
    <group ref={groupRef}>
      <mesh
        position={[0, BOARD_SURFACE_Y + 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-2}
        raycast={ignoreRaycast}
      >
        <ringGeometry
          args={[
            0.72,
            BOARD_RADIUS,
            96,
            1,
            -STORM_SECTOR_ANGLE / 2,
            STORM_SECTOR_ANGLE,
          ]}
        />
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
      const progress =
        animate && motion ? Math.min(1, elapsed.current / 0.65) : 1;
      group.current.scale.setScalar(1 - (1 - progress) ** 3);
      if (progress < 1) {
        invalidate();
      }
    }
  });
  const mapGeometry = useMemo(
    () => boardMapGeometry(arrakisMapSvg, BOARD_RADIUS),
    [],
  );
  useEffect(() => () => mapGeometry.dispose(), [mapGeometry]);
  return (
    <group ref={group} scale={animate && motion ? 0 : 1}>
      <mesh
        receiveShadow
        position={[0, BOARD_SURFACE_Y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={ignoreRaycast}
      >
        <circleGeometry args={[BOARD_RADIUS, 128]} />
        <meshStandardMaterial
          color={BOARD_MAP_BASE_COLOR}
          roughness={0.88}
          metalness={0}
        />
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
        <meshStandardMaterial
          vertexColors
          transparent
          depthWrite={false}
          roughness={0.88}
          metalness={0}
        />
      </mesh>
    </group>
  );
}

function BoardSurface({
  seatCount,
  stormSectorIndex,
  stage,
  mapVisible,
  tableProgress,
  trackerSlots,
}: {
  seatCount: TableSeatCount;
  stormSectorIndex: number;
  stage: TabletopSceneProps["stage"];
  mapVisible?: boolean;
  tableProgress?: TableProgress;
  trackerSlots: readonly TrackerArcSlot[];
}) {
  return (
    <group>
      <TableFurniture trackerSlots={trackerSlots} />
      <BoardRim seatCount={seatCount} />
      {/* The textured parts suspend while their image loads; the boundary keeps that inside the scene, so the
          rim, the furniture and the pieces stay on screen and the map fills in, instead of the route's
          placeholder replacing a table the visitor has already seen. While it waits it counts as unsettled artwork. */}
      {(stage !== "setup" || mapVisible) && (
        <BoardMap animate={stage === "setup"} />
      )}
      <Suspense fallback={<ArtworkPending />}>
        {boardFurnitureFor(stage).storm && (
          <StormSectorHighlight sectorIndex={stormSectorIndex} />
        )}
      </Suspense>
      <mesh
        position={[0, BOARD_SURFACE_Y + 0.005, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <circleGeometry args={[BOARD_RADIUS, 128]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {Array.from({ length: TABLE_SECTOR_COUNT }, (_, index) => {
        const angle = (index / TABLE_SECTOR_COUNT) * Math.PI * 2;
        const radius = BOARD_RADIUS + (BOARD_RIM_RADIUS - BOARD_RADIUS) / 2;
        return (
          <mesh
            key={index}
            position={[
              Math.cos(angle) * radius,
              BOARD_RIM_SURFACE_Y - BOARD_RIM_DEPTH / 2,
              Math.sin(angle) * radius,
            ]}
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
            <meshStandardMaterial
              color={BOARD_RIM_DIVIDER_COLOR}
              roughness={0.88}
              metalness={0}
            />
          </mesh>
        );
      })}
      <PlayerStations seatCount={seatCount} />
      {tableProgress ? (
        <TableTrackers progress={tableProgress} slots={trackerSlots} />
      ) : null}
    </group>
  );
}

function stackLayerFaceUp(
  piece: TablePiece,
  index: number,
  shownLayers: number,
) {
  const itemIndex = stackLayerItemIndex(
    piece.items.length,
    shownLayers,
    index,
    piece.flipRevision,
  );
  return piece.items[itemIndex]?.faceUp ?? true;
}

function PieceFace({
  height,
  underside,
  children,
}: {
  height: number;
  underside: boolean;
  children: ReactNode;
}) {
  return (
    <group
      position={[0, underside ? -0.001 : height + 0.001, 0]}
      /* The underside is also turned end over end, so the flip's half turn about the long edge shows it the same way up as the top face it replaces. */
      rotation={underside ? [Math.PI / 2, 0, Math.PI] : [-Math.PI / 2, 0, 0]}
    >
      {children}
    </group>
  );
}

/* Every piece and every stack layer that shows the same published image draws one shared texture, so the image is uploaded once rather than once per face. */
const subscribePublishedFace = sharedPublishedFaces<Texture>({
  load: (href, onLoad, onError) =>
    new TextureLoader().load(href, onLoad, undefined, onError),
  prepare: (value) => {
    value.colorSpace = SRGBColorSpace;
    value.anisotropy = 8;
  },
  release: (value) => value.dispose(),
});

/*
 * Holds one published image and returns it once loaded. The shared store is the only source of truth, read through
 * useSyncExternalStore, so a face never draws a texture released while it showed another image, and a retried load
 * that lands later always re-renders it.
 */
function usePublishedFace(href: string | undefined): Texture | undefined {
  const subscribe = useCallback(
    (onChange: () => void) =>
      href ? subscribePublishedFace(href, onChange) : () => {},
    [href],
  );
  const snapshot = useCallback(
    () => (href ? subscribePublishedFace.peek(href) : undefined),
    [href],
  );
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

function PublishedFace({
  href,
  card,
  ratio,
}: {
  href: string;
  card: boolean;
  ratio?: number | null;
}) {
  /* Piece art skips useTexture so a missing publication image retries in place instead of suspending the table. */
  const texture = usePublishedFace(href) ?? null;
  return (
    <mesh position={[0, 0, 0.002]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
      {card ? (
        <planeGeometry args={[CARD_WIDTH, CARD_DEPTH]} />
      ) : ratio != null ? (
        <planeGeometry
          args={[TROOP_FACE_RADIUS * 2, TROOP_FACE_RADIUS * 2 * ratio]}
        />
      ) : (
        <circleGeometry args={[TROOP_FACE_RADIUS, 48]} />
      )}
      {/* Printed art is drawn unlit: the warm table light washed out card, leader and token faces (#1756). The renderer still tone maps the whole frame in its output pass. The placeholder stays lit, like the piece beneath it. */}
      {texture ? (
        <meshBasicMaterial key={href} map={texture} transparent />
      ) : (
        <meshStandardMaterial
          key="placeholder"
          color="#d5ba8c"
          transparent
          roughness={0.68}
          metalness={0}
        />
      )}
    </mesh>
  );
}

/* Holds the image a piece shows on top and says whether it is loaded, so a flip can wait for a card's revealed face instead of turning up a placeholder. */
function usePublishedFaceReady(href: string | undefined): boolean {
  return usePublishedFace(href) !== undefined || !href;
}

/* A face-down faction token wears a solid black prohibition sign over its front: a ring and the slash across it, the slash as thick as the ring (#1007). */
const SITTING_OUT_OUTER = TROOP_FACE_RADIUS * 0.86;
const SITTING_OUT_INNER = TROOP_FACE_RADIUS * 0.66;
const SITTING_OUT_STROKE = SITTING_OUT_OUTER - SITTING_OUT_INNER;

function SittingOutSign() {
  return (
    <group position={[0, 0, 0.003]}>
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        <ringGeometry args={[SITTING_OUT_INNER, SITTING_OUT_OUTER, 64]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh
        rotation={[0, 0, Math.PI / 4]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
      >
        <planeGeometry args={[SITTING_OUT_INNER * 2, SITTING_OUT_STROKE]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
}

function TokenFace({
  piece,
  faceUp,
  underside = false,
  itemIndex,
}: {
  piece: TablePiece;
  faceUp: boolean;
  underside?: boolean;
  itemIndex: number;
}) {
  /* A faction token has no back of its own: face down, it shows its front under a black prohibition sign. */
  const blocked = !faceUp && isFactionToken(piece);
  const href =
    piece.items[itemIndex]?.artwork?.[faceUp || blocked ? "front" : "back"];
  return (
    <PieceFace height={TROOP_LAYER_HEIGHT} underside={underside}>
      {href && (
        <PublishedFace href={href} card={false} ratio={tokenBoxRatio(piece)} />
      )}
      {blocked && <SittingOutSign />}
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        {tokenBoxRatio(piece) != null ? (
          <planeGeometry
            args={[
              TROOP_FACE_RADIUS * 2,
              TROOP_FACE_RADIUS * 2 * tokenBoxRatio(piece)!,
            ]}
          />
        ) : (
          <circleGeometry args={[TROOP_FACE_RADIUS, 48]} />
        )}
        <meshStandardMaterial
          color={faceUp ? piece.accent : "#261c18"}
          roughness={0.5}
          metalness={0.08}
        />
      </mesh>
      {!faceUp && !piece.items[itemIndex]?.artwork ? (
        <mesh
          position={[0, 0, 0.001]}
          renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        >
          <ringGeometry
            args={[TROOP_FACE_RADIUS * 0.64, TROOP_FACE_RADIUS * 0.78, 48]}
          />
          <meshStandardMaterial
            color={piece.accent}
            roughness={0.5}
            metalness={0.08}
          />
        </mesh>
      ) : null}
    </PieceFace>
  );
}

/*
 * Layers overlap, so a face between two layers sits inside its neighbour and is never seen.
 * A stack draws only its top face and its underside, which shows when the whole stack turns over.
 */
function TroopStackLayers({ piece }: { piece: TablePiece }) {
  const shownLayers = visibleLayerCount(piece);
  const scale = troopScale(piece);
  return (
    <group scale={[scale, 1, scale]}>
      {Array.from({ length: shownLayers }, (_, index) => {
        const faceUp = stackLayerFaceUp(piece, index, shownLayers);
        return (
          <group key={index} position={[0, index * TROOP_LAYER_PITCH, 0]}>
            <mesh
              position={[0, TROOP_LAYER_HEIGHT / 2, 0]}
              renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
              rotation={[0, 0, faceUp ? 0 : Math.PI]}
            >
              {tokenBoxRatio(piece) != null ? (
                <boxGeometry
                  args={[
                    TROOP_TOP_RADIUS * 2,
                    TROOP_LAYER_HEIGHT,
                    TROOP_TOP_RADIUS * 2 * tokenBoxRatio(piece)!,
                  ]}
                />
              ) : (
                <cylinderGeometry
                  args={[
                    TROOP_TOP_RADIUS,
                    TROOP_BOTTOM_RADIUS,
                    TROOP_LAYER_HEIGHT,
                    48,
                  ]}
                />
              )}
              <meshStandardMaterial
                color={piece.color}
                roughness={0.56}
                metalness={0.1}
              />
            </mesh>
            {index === shownLayers - 1 ? (
              <TokenFace
                piece={piece}
                faceUp={faceUp}
                itemIndex={stackLayerItemIndex(
                  piece.items.length,
                  shownLayers,
                  index,
                  piece.flipRevision,
                )}
              />
            ) : null}
            {index === 0 ? (
              <TokenFace
                piece={piece}
                faceUp={!faceUp}
                underside
                itemIndex={stackLayerItemIndex(
                  piece.items.length,
                  shownLayers,
                  index,
                  piece.flipRevision,
                )}
              />
            ) : null}
          </group>
        );
      })}
    </group>
  );
}

function CardFace({
  piece,
  faceUp,
  underside = false,
  covered = false,
  itemIndex,
}: {
  piece: TablePiece;
  faceUp: boolean;
  underside?: boolean;
  /* A card under another shows only a sliver at its edge, never its centre panel. */
  covered?: boolean;
  itemIndex: number;
}) {
  return (
    <PieceFace height={CARD_LAYER_HEIGHT} underside={underside}>
      {piece.items[itemIndex]?.artwork?.[faceUp ? "front" : "back"] && (
        <PublishedFace
          href={piece.items[itemIndex].artwork![faceUp ? "front" : "back"]!}
          card
        />
      )}
      {faceUp && piece.items[itemIndex]?.artwork?.prediction && (
        <Suspense fallback={null}>
          <PredictionOverlay
            prediction={piece.items[itemIndex].artwork.prediction}
          />
        </Suspense>
      )}
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}>
        <planeGeometry args={[CARD_WIDTH, CARD_DEPTH]} />
        <meshStandardMaterial
          color={faceUp ? piece.color : "#2b1a1a"}
          roughness={0.68}
          metalness={0.03}
        />
      </mesh>
      {covered ? null : (
        <mesh
          position={[0, 0, 0.001]}
          renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        >
          <planeGeometry args={[0.58, 0.82]} />
          <meshBasicMaterial
            color={piece.accent}
            transparent
            depthWrite={false}
            opacity={faceUp ? 0.74 : 0.38}
          />
        </mesh>
      )}
    </PieceFace>
  );
}

/*
 * Staggered cards show a sliver of every face, on top and, while the stack turns over, underneath.
 * Only the centre panel of a covered face is always hidden, so a covered card skips it.
 */
function CardStackLayers({ piece }: { piece: TablePiece }) {
  const shownLayers = visibleLayerCount(piece);
  return (
    <group>
      {Array.from({ length: shownLayers }, (_, index) => {
        const faceUp = stackLayerFaceUp(piece, index, shownLayers);
        return (
          <group
            key={index}
            position={[
              (index - (shownLayers - 1) / 2) * CARD_LAYER_STAGGER,
              index * CARD_LAYER_PITCH,
              0,
            ]}
          >
            <mesh
              position={[0, CARD_LAYER_HEIGHT / 2, 0]}
              renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
            >
              <boxGeometry args={[CARD_WIDTH, CARD_LAYER_HEIGHT, CARD_DEPTH]} />
              <meshStandardMaterial
                color="#ead9bb"
                roughness={0.68}
                metalness={0.03}
              />
            </mesh>
            <CardFace
              piece={piece}
              faceUp={faceUp}
              covered={index < shownLayers - 1}
              itemIndex={stackLayerItemIndex(
                piece.items.length,
                shownLayers,
                index,
                piece.flipRevision,
              )}
            />
            <CardFace
              piece={piece}
              faceUp={!faceUp}
              underside
              covered={index > 0}
              itemIndex={stackLayerItemIndex(
                piece.items.length,
                shownLayers,
                index,
                piece.flipRevision,
              )}
            />
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
      <mesh
        position={[0, MARKER_BASE_HEIGHT / 2, 0]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
      >
        <cylinderGeometry
          args={[
            MARKER_TOP_RADIUS,
            MARKER_BOTTOM_RADIUS,
            MARKER_BASE_HEIGHT,
            8,
          ]}
        />
        <meshStandardMaterial
          color={piece.color}
          roughness={0.48}
          metalness={0.28}
        />
      </mesh>
      <mesh
        position={[0, MARKER_CONE_CENTER_Y, 0]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        rotation={[0, 0.2, 0]}
      >
        <coneGeometry args={[MARKER_CONE_RADIUS, MARKER_CONE_HEIGHT, 8]} />
        <meshStandardMaterial
          color={piece.accent}
          roughness={0.45}
          metalness={0.2}
        />
      </mesh>
    </group>
  );
}

function SpiceLayers({ piece }: { piece: TablePiece }) {
  return (
    <group>
      {Array.from({ length: visibleLayerCount(piece) }, (_, index) => (
        <group key={index} position={[0, index * SPICE_LAYER_PITCH, 0]}>
          <mesh
            position={[0, SPICE_LAYER_HEIGHT / 2, 0]}
            renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
          >
            <cylinderGeometry
              args={[
                SPICE_TOKEN_RADIUS,
                SPICE_TOKEN_RADIUS,
                SPICE_LAYER_HEIGHT,
                48,
              ]}
            />
            <meshStandardMaterial
              color="#b8842f"
              roughness={0.8}
              metalness={0}
            />
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

/*
 * What a piece shows besides itself, worked out by the scene so each piece receives plain values.
 * A piece renders again only when one of them or the piece changes, not on every update to the table.
 */
type PieceSceneState = {
  selected: boolean;
  stackTargeted: boolean;
  drafted: boolean;
  remoteCarried: boolean;
  locallyCarried: boolean;
  reserved: boolean;
  interactionBlocked: boolean;
  canHandleTable: boolean;
  /* No piece opens its menu while a piece is in hand. */
  carrying: boolean;
  owner: string | undefined;
  /* Who peeked at the piece, as its tag says it under the name. */
  peeked: string | undefined;
  /* A faction token's Treachery card count, shown beside it to everyone; undefined on every other piece. */
  handCount: number | undefined;
};

type TablePieceMeshProps = {
  piece: TablePiece;
  showLabels?: boolean;
} & PieceSceneState;

function pieceSceneState(
  piece: TablePiece,
  {
    state,
    gestureActivePieceId,
    canHandleTable,
    remoteCarriedIds,
    reservedPieceIds,
  }: Pick<
    TabletopContextValue,
    | "state"
    | "gestureActivePieceId"
    | "canHandleTable"
    | "remoteCarriedIds"
    | "reservedPieceIds"
  >,
): PieceSceneState {
  const drafted = state.draftMove?.pieceId === piece.id;
  const remoteCarried = remoteCarriedIds.has(piece.id);
  const reserved = reservedPieceIds.has(piece.id);
  const localSource = state.draftMove?.sourcePieceId === piece.id;
  return {
    selected: state.selectedPieceId === piece.id,
    stackTargeted: state.draftMove?.targetPieceId === piece.id,
    drafted,
    remoteCarried,
    locallyCarried: drafted && gestureActivePieceId !== null,
    reserved,
    interactionBlocked:
      !canHandleTable || remoteCarried || (reserved && !localSource),
    canHandleTable,
    carrying: Boolean(state.draftMove),
    owner: pieceOwnerName(piece, state),
    peeked: peekedLine(piece, state),
    handCount: isFactionToken(piece)
      ? state.handCounts?.[piece.owner]
      : undefined,
  };
}

/* "Fremen peeked at this", naming every faction that peeked at a card or token of the piece. */
function peekedLine(
  piece: TablePiece,
  state: Pick<TableState, "factionNames">,
) {
  const names = peekersOf(piece).map((id) => state.factionNames[id] ?? id);
  if (!names.length) {
    return undefined;
  }
  const who =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${who} peeked at this`;
}

function useTablePointFromClient() {
  const { camera, renderer } = useThree();
  const normalizedPointer = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointFromClient = useCallback(
    (
      piece: TablePiece,
      clientX: number,
      clientY: number,
    ): Vector3Tuple | null => {
      if (!isPublicTablePoint(renderer.domElement, clientX, clientY)) {
        return null;
      }
      const bounds = renderer.domElement.getBoundingClientRect();
      normalizedPointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(normalizedPointer, camera);
      return pointOnPieceDragRay(
        piece,
        [
          raycaster.ray.origin.x,
          raycaster.ray.origin.y,
          raycaster.ray.origin.z,
        ],
        [
          raycaster.ray.direction.x,
          raycaster.ray.direction.y,
          raycaster.ray.direction.z,
        ],
      );
    },
    [camera, normalizedPointer, raycaster, renderer.domElement],
  );

  return pointFromClient;
}

function useScenePointerSession(onActiveChange: (active: boolean) => void) {
  const session = usePointerSession();
  const {
    state,
    beginGesture,
    updateGesture,
    finishGesture,
    cancelDraft,
    canHandleTable,
    publishPointer,
  } = useTabletop();
  const { renderer } = useThree();
  const point = useTablePointFromClient();
  const controls = {
    canHandleTable,
    hasDraft: Boolean(state.draftMove),
    piece: (id: string) => state.pieces.find((piece) => piece.id === id),
    point,
    isPublicPoint: (x: number, y: number) =>
      isPublicTablePoint(renderer.domElement, x, y),
    beginGesture,
    updateGesture,
    finishGesture,
    cancelDraft,
    publishPointer,
    onActiveChange,
  };
  const live = useRef(controls);
  useLayoutEffect(() => {
    live.current = controls;
    session.reconcile();
  });
  useLayoutEffect(
    () =>
      session.bind({
        events: window,
        canvas: renderer.domElement,
        read: () => live.current,
      }),
    [renderer.domElement, session],
  );
}

/**
 * Ends every hover when the pointer leaves the canvas, the window loses focus or the page hides, so no hover-armed shortcut acts off the table.
 * R3F's own `pointerleave` on its wrapper clears only pointer id 0, and a Chromium mouse is id 1, so its hover would outlive the leave.
 * Its `onPointerCancel` handler forgets the given pointer and fires the real leave handlers, and the next move over an object enters it afresh.
 * The leave is heard on the canvas too, because drei's `Html` overlays sit inside the wrapper, so a move onto one leaves the canvas but not the wrapper.
 * A touch is left alone: it leaves after every tap, before the click that R3F can only deliver while it still remembers the pointer.
 */
function useCanvasHoverReset() {
  const connected = useThree(
    (state) => state.events.connected as EventTarget | undefined,
  );
  const cancel = useThree((state) => state.events.handlers?.onPointerCancel);
  const internal = useThree((state) => state.internal);
  const { renderer } = useThree();
  useEffect(() => {
    if (!connected || !cancel) {
      return;
    }
    const canvas = renderer.domElement;
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        cancel(event);
      }
    };
    const cancelAll = () => {
      for (const pointerId of internal.pointerMap.keys()) {
        cancel(new PointerEvent("pointercancel", { pointerId }));
      }
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        cancelAll();
      }
    };
    connected.addEventListener("pointerleave", leave as EventListener);
    canvas.addEventListener("pointerleave", leave);
    window.addEventListener("blur", cancelAll);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      connected.removeEventListener("pointerleave", leave as EventListener);
      canvas.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", cancelAll);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [connected, cancel, internal, renderer]);
}

/*
 * Names the drawing surface itself, not R3F's wrapper: drei's `Html` overlays, the battle callout's buttons among them, sit inside the wrapper, and an image role there would hide them from assistive technology.
 */
function useCanvasName() {
  const { renderer } = useThree();
  useLayoutEffect(() => {
    const canvas = renderer.domElement;
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Game table");
  }, [renderer]);
}

function pieceHoverCursor(
  canInteract: boolean,
  interactionBlocked: boolean,
  gestureBlocked: boolean,
) {
  if (interactionBlocked) {
    return canInteract ? "not-allowed" : "default";
  }
  return gestureBlocked ? "not-allowed" : "grab";
}

/* Opens a piece's menu at a point; `touch` says a finger asked for it, which has no keyboard shortcut to offer. */
const PieceMenuContext = createContext<
  ((pieceId: string, x: number, y: number, touch: boolean) => void) | null
>(null);

function usePiecePointerEvents({
  piece,
  interactionBlocked,
  canHandleTable,
  carrying,
}: TablePieceMeshProps) {
  const { selectPiece, setHoveredPiece } = useTabletopActions();
  const openPieceMenu = useContext(PieceMenuContext);
  /* A selector, so a change elsewhere in the scene's store does not render every piece again. */
  const renderer = useThree((state) => state.renderer);
  const pointerSession = usePointerSession();
  const gestureBlocked = gestureBlockReason(piece);
  const hasMenu =
    !carrying &&
    (piece.kind === "card" || isSpicePiece(piece) || peekableToken(piece)) &&
    !piece.inventory;
  const stopLongPress = useRef<(() => void) | null>(null);
  useEffect(() => () => stopLongPress.current?.(), []);

  return {
    onContextMenu: (event: ThreeEvent<MouseEvent>) => {
      if (hasMenu && openPieceMenu) {
        event.stopPropagation();
        const { clientX, clientY } = event.nativeEvent;
        /* Android's long-press context menu is a touch pointer event. */
        const touch =
          "pointerType" in event.nativeEvent &&
          event.nativeEvent.pointerType === "touch";
        openPieceMenu(piece.id, clientX, clientY, touch);
      }
    },
    onClick: (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
    },
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (event.button !== 0 || interactionBlocked) {
        return;
      }
      event.stopPropagation();
      if (pointerSession.busy) {
        return;
      }
      selectPiece(piece.id);
      /*
       * A touch has no right-click, and iOS never turns a long press into a context menu, so a finger resting on a deck or spice opens the same menu.
       * A finger that moves first is carrying the piece, and the menu leaves it alone.
       */
      stopLongPress.current?.();
      stopLongPress.current = null;
      if (event.pointerType === "touch" && hasMenu && openPieceMenu) {
        const { clientX, clientY } = event.nativeEvent;
        stopLongPress.current = watchLongPress(
          window,
          event.nativeEvent,
          () => {
            stopLongPress.current = null;
            if (pointerSession.isDragging(piece.id)) {
              return;
            }
            /* Only this finger's press stops; another finger may be carrying another piece. */
            if (pointerSession.isPressing(piece.id)) {
              pointerSession.cancel();
            }
            stopLongPress.current = swallowLift(window, { clientX, clientY });
            /* Android also sends a context menu for the long press; opening the same menu twice changes nothing. */
            openPieceMenu(piece.id, clientX, clientY, true);
          },
        );
      }
      if (gestureBlocked) {
        return;
      }
      pointerSession.press(event.nativeEvent, piece.id);
    },
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      /* A finger has no hover: its leave is never heard, so a tap's jitter would leave the piece armed for the keys after the selection moves on. */
      if (event.pointerType === "touch") {
        return;
      }
      const cursor = pieceHoverCursor(
        canHandleTable,
        interactionBlocked,
        Boolean(gestureBlocked),
      );
      if (interactionBlocked) {
        renderer.domElement.style.cursor = cursor;
        return;
      }
      setHoveredPiece(piece.id);
      renderer.domElement.style.cursor = cursor;
    },
    onPointerLeave: () => {
      setHoveredPiece(null);
      if (!pointerSession.isDragging(piece.id)) {
        renderer.domElement.style.cursor = "default";
      }
    },
  };
}

const PIECE_SELECTION_RING_MATERIAL = {
  transparent: true,
  opacity: 0.92,
} as const;

const PIECE_SELECTION_RADII: Record<
  TablePiece["kind"],
  [number, number, number]
> = {
  card: [0.7, 0.78, 64],
  force: [0.2, 0.235, 64],
  marker: [0.4, 0.47, 64],
};

function selectionRadii(piece: TablePiece): [number, number, number] {
  const [inner, outer, segments] = PIECE_SELECTION_RADII[piece.kind];
  const scale = troopScale(piece);
  return [inner * scale, outer * scale, segments];
}

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
      <ringGeometry
        args={isSpicePiece(piece) ? [0.18, 0.205, 64] : selectionRadii(piece)}
      />
      <meshBasicMaterial
        color={stackTargeted ? "#f6bd55" : drafted ? "#f6c879" : "#fff0c9"}
        {...PIECE_SELECTION_RING_MATERIAL}
      />
    </mesh>
  );
}

/**
 * Compiles the selection ring's shader while the table loads.
 * No ring is on the table until a piece is first pressed, so without this the first press waits for a shader compile, the slowest step on a phone's GPU.
 * The material lives as long as the table: disposing it would release the compiled program with it.
 */
function SelectionRingWarmup() {
  const { renderer, scene, camera } = useThree();
  useEffect(() => {
    const geometry = new RingGeometry(...PIECE_SELECTION_RADII.card);
    const material = new MeshBasicMaterial(PIECE_SELECTION_RING_MATERIAL);
    const ring = new Mesh(geometry, material);
    /* Off-screen or not, it must compile. */
    ring.frustumCulled = false;
    renderer.compileAsync(ring, camera, scene).catch(() => {});
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [renderer, scene, camera]);
  return null;
}

function PieceLayers({ piece }: { piece: TablePiece }) {
  if (piece.kind === "marker") {
    return <MarkerLayers piece={piece} />;
  }
  return piece.kind === "card" ? (
    <CardStackLayers piece={piece} />
  ) : (
    <TroopStackLayers piece={piece} />
  );
}

function PieceLock({ piece }: { piece: TablePiece }) {
  if (!piece.locked) {
    return null;
  }
  const lock = (
    <mesh
      position={[0.3, 0.42, 0.2]}
      renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
    >
      <boxGeometry args={[0.16, 0.19, 0.09]} />
      <meshStandardMaterial color="#251912" metalness={0.3} roughness={0.6} />
    </mesh>
  );
  return piece.kind === "force" ? (
    <group scale={0.5 * troopScale(piece)}>{lock}</group>
  ) : (
    lock
  );
}

/*
 * The faction that owns a piece, by its display name; a shared piece, or an owner the roster does not name, has none.
 * A label that already carries the name ('Atreides troops', 'Atreides alliance') names it once, and when another
 * seat's faction shares that name the badge adds only what tells them apart (#1667).
 */
function pieceOwnerName(
  piece: TablePiece,
  state: Pick<TableState, "factionNames" | "factionTieBreaks">,
) {
  const owner =
    piece.owner === "shared" ? undefined : state.factionNames[piece.owner];
  if (!owner) {
    return undefined;
  }
  const tieBreak = state.factionTieBreaks?.[piece.owner];
  if (piece.label.includes(owner)) {
    return tieBreak;
  }
  return tieBreak ? `${owner} (${tieBreak})` : owner;
}

const TablePieceMesh = memo(function TablePieceMesh(
  props: TablePieceMeshProps,
) {
  const {
    piece,
    drafted,
    remoteCarried,
    locallyCarried,
    reserved,
    selected,
    stackTargeted,
    owner,
    peeked,
    handCount,
  } = props;
  const { finishPieceFlip } = useTabletopActions();
  const pointerEvents = usePiecePointerEvents(props);
  const displayedCount = pieceCount(piece);
  const emptyProjection = displayedCount === 0;
  const carried = locallyCarried || remoteCarried;
  const poseRef = useTablePose(
    piece.position,
    piece.orientation,
    remoteCarried,
    locallyCarried,
  );
  const faceReady = usePublishedFaceReady(topFaceHref(piece));
  const { pivotRef, labelRef, shadowRef, badgeRef } = usePieceFlipAnimation(
    piece,
    drafted || remoteCarried || emptyProjection,
    finishPieceFlip,
    faceReady,
  );
  const shuffleRef = useDeckShuffleAnimation(piece, carried || emptyProjection);
  const flipPivotY = stackTopHeight(piece) / 2;
  const shadowLocalY =
    contactShadowHeightAt(piece.position, piece) - piece.position[1];

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
              <group ref={shuffleRef}>
                <PieceLayers piece={piece} />
              </group>
            </group>
          </group>
          <PieceLock piece={piece} />
          {handCount === undefined ? null : (
            <Suspense fallback={null}>
              <HandCountChip
                piece={piece}
                count={handCount}
                className={styles.handCount}
              />
            </Suspense>
          )}
          {props.showLabels !== false && (
            <Suspense fallback={null}>
              <PieceBadge
                classNames={{
                  pieceTag: styles.pieceTag,
                  pieceName: styles.pieceName,
                  pieceNameOwner: styles.pieceNameOwner,
                  pieceNamePeeked: styles.pieceNamePeeked,
                  pieceCount: styles.pieceCount,
                  pieceCountSelected: styles.pieceCountSelected,
                }}
                piece={piece}
                owner={owner}
                peeked={peeked}
                selected={selected}
                labelRef={labelRef}
                badgeRef={badgeRef}
              />
            </Suspense>
          )}
        </>
      ) : null}
    </group>
  );
});

function useSceneInteractions(
  onInteractionActiveChange: TabletopSceneProps["onInteractionActiveChange"],
) {
  const gestureActivePieceId = useTabletopSelector(
    (table) => table.gestureActivePieceId,
  );
  const [pointerActive, setPointerActive] = useState(false);
  const onPointerSessionChange = useCallback(
    (nextActive: boolean) => {
      setPointerActive(nextActive);
      if (nextActive) {
        onInteractionActiveChange?.(true);
      }
    },
    [onInteractionActiveChange],
  );
  const sceneInteractionActive = pointerActive || gestureActivePieceId !== null;

  useEffect(() => {
    onInteractionActiveChange?.(sceneInteractionActive);
  }, [onInteractionActiveChange, sceneInteractionActive]);
  useEffect(
    () => () => onInteractionActiveChange?.(false),
    [onInteractionActiveChange],
  );

  return {
    controlsEnabled: !gestureActivePieceId && !pointerActive,
    onPointerSessionChange,
  };
}

/**
 * Frees the renderer, and with it the canvas's WebGL context or GPU device, once the table's canvas has left the page.
 * R3F does this on unmount only for its legacy WebGLRenderer, so every remount of the table (a reconnect, a reload of the view) otherwise left a live context behind until the browser ran out of them.
 * A canvas still on the page is a remount of this component alone, as R3F's own teardown assumes, and keeps its renderer.
 */
function ReleaseRendererOnUnmount() {
  const renderer = useThree((state) => state.renderer);
  useEffect(
    () => () => {
      if (!renderer.domElement.isConnected) {
        renderer.dispose();
      }
    },
    [renderer],
  );
  return null;
}

/* The table's lights, scaled by this viewer's lighting choice; only they re-render while the slider moves. */
function TableLights() {
  const lighting = useTableLighting();
  return (
    <>
      <ambientLight intensity={1.25 * lighting} />
      <directionalLight
        position={[-4, 9, 5]}
        intensity={3.1 * lighting}
        color="#ffe2ae"
      />
      <pointLight
        position={[5, 4, -4]}
        intensity={14 * lighting}
        distance={16}
        color="#d67b44"
      />
    </>
  );
}

function SceneContents({
  cameraView = DEFAULT_CAMERA_VIEW,
  onInteractionActiveChange,
  seatCount = DEFAULT_TABLE_SEAT_COUNT,
  tableProgress,
  trackerSlots,
  mapFramingPoints,
  stage,
  mapVisible,
  presentation,
}: Pick<
  TabletopSceneProps,
  | "cameraView"
  | "onInteractionActiveChange"
  | "seatCount"
  | "tableProgress"
  | "stage"
  | "mapVisible"
  | "presentation"
> & {
  trackerSlots: readonly TrackerArcSlot[];
  mapFramingPoints: readonly Vector3Tuple[];
}) {
  const table = useTabletop();
  const { state, renderedPieces, selectPiece } = table;
  const { controlsEnabled, onPointerSessionChange } = useSceneInteractions(
    onInteractionActiveChange,
  );
  useScenePointerSession(onPointerSessionChange);
  useCanvasHoverReset();
  useCanvasName();

  return (
    <>
      {presentation !== "preview" && (
        <>
          <color attach="background" args={["#130d0a"]} />
          <fog attach="fog" args={["#130d0a", 10, 22]} />
        </>
      )}
      {presentation !== "preview" && (
        <Suspense fallback={null}>
          <ScenePresence showNames />
        </Suspense>
      )}
      <TableLights />
      <group onClick={() => selectPiece(null)}>
        <BoardSurface
          seatCount={seatCount}
          stormSectorIndex={state.stormSectorIndex}
          stage={stage}
          mapVisible={mapVisible}
          tableProgress={tableProgress}
          trackerSlots={trackerSlots}
        />
        {renderedPieces
          /* Troop reserves arrive with the board: setup keeps them off the table until the map shows. */
          .filter(
            (piece) =>
              !piece.battleOverlay &&
              (stage !== "setup" || mapVisible || !isTroopStack(piece)),
          )
          .map((piece) => (
            <TablePieceMesh
              showLabels={presentation !== "preview"}
              key={piece.id}
              piece={piece}
              {...pieceSceneState(piece, table)}
            />
          ))}
      </group>
      {presentation === "preview" ? (
        <MapPreviewCamera />
      ) : (
        <Suspense fallback={<MapPreviewCamera />}>
          <PlayCamera
            enabled={controlsEnabled}
            command={cameraView}
            mapFramingPoints={mapFramingPoints}
          />
        </Suspense>
      )}
      <SelectionRingWarmup />
    </>
  );
}

export function TabletopScene({
  children,
  className,
  cameraView = DEFAULT_CAMERA_VIEW,
  onInteractionActiveChange,
  seatCount = DEFAULT_TABLE_SEAT_COUNT,
  tableProgress: providedProgress,
  onSceneReady,
  onSceneUnavailable,
  presentation = "play",
  stage,
  mapVisible,
}: TabletopSceneProps) {
  const { takeAdditionalFromTarget } = useTabletopCommands();
  /* The frame around the canvas follows only what it shows, so a held piece moving renders the pieces and not the canvas. */
  const hasDraft = useTabletopSelector(
    (table) => table.state.draftMove !== null,
  );
  const menuAvailable = useTabletopSelector((table) =>
    Boolean(
      table.deckControls || table.spiceReserveControls || table.peekControls,
    ),
  );
  const [pieceMenu, setPieceMenu] = useState<PieceMenuAnchor | null>(null);
  /* One opener for the table's life: a new one on every update would render every piece again. */
  const openPieceMenu = useCallback(
    (pieceId: string, x: number, y: number, touch: boolean) =>
      /* A long press may also send a context menu; the second opening keeps the finger's menu. */
      setPieceMenu((current) => ({
        pieceId,
        x,
        y,
        touch: touch || (current?.pieceId === pieceId && current.touch),
      })),
    [],
  );
  const { trackers } = boardFurnitureFor(stage);
  const tableProgress = trackers === "none" ? undefined : providedProgress;
  const phaseCount = tableProgress?.phases.length ?? null;
  const trackerSlots = useMemo(() => {
    const slots = phaseCount === null ? [] : trackerArcSlots(phaseCount);
    return trackers === "spice"
      ? slots.filter((slot) => slot.kind === "spice")
      : slots;
  }, [phaseCount, trackers]);
  const mapFramingPoints = useMemo(
    () => mapViewFramingPoints(trackerSlots, seatCount),
    [seatCount, trackerSlots],
  );
  const camera = useMemo(
    () => ({
      position: cameraPoseFor("map", 1, mapFramingPoints).position,
      fov: TABLE_CAMERA_FIELD_OF_VIEW,
      near: TABLE_CAMERA_NEAR,
      far: TABLE_CAMERA_FAR,
    }),
    [mapFramingPoints],
  );
  const graphics = useTableGraphics();
  const areaRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={areaRef}
      className={className}
      onContextMenu={(event) => {
        event.preventDefault();
        if (hasDraft) {
          takeAdditionalFromTarget();
          return;
        }
      }}
    >
      {presentation === "play" && (
        <Suspense fallback={null}>
          <TabletopTools
            pieceMenu={pieceMenu}
            onMenuChange={setPieceMenu}
            area={areaRef}
            keyboardActionsClassName={styles.keyboardActions}
          />
        </Suspense>
      )}
      <PieceMenuContext.Provider
        value={presentation === "play" && menuAvailable ? openPieceMenu : null}
      >
        {graphics === "unavailable" && (
          <TableGraphicsUnavailable
            silent={presentation === "preview"}
            onShown={onSceneUnavailable ?? onSceneReady}
          />
        )}
        {graphics === "ready" && (
          <TableGraphicsBoundary
            silent={presentation === "preview"}
            onShown={onSceneUnavailable ?? onSceneReady}
          >
            <Canvas
              camera={camera}
              dpr={[1, 2]}
              frameloop="demand"
              renderer={{
                antialias: true,
                alpha: presentation === "preview",
                powerPreference: "high-performance",
                toneMapping: NeutralToneMapping,
              }}
              /* The renderer's creation follows its asynchronous initialisation, which is the long part of a table's arrival; the first frame follows at once. */
              onCreated={presentation === "play" ? onSceneReady : undefined}
            >
              <ReleaseRendererOnUnmount />
              {presentation === "preview" && (
                <PreviewArrival onReady={onSceneReady} />
              )}
              {children}
              <SceneContents
                presentation={presentation}
                stage={stage}
                mapVisible={mapVisible}
                cameraView={cameraView}
                onInteractionActiveChange={onInteractionActiveChange}
                seatCount={seatCount}
                tableProgress={tableProgress}
                trackerSlots={trackerSlots}
                mapFramingPoints={mapFramingPoints}
              />
            </Canvas>
          </TableGraphicsBoundary>
        )}
      </PieceMenuContext.Provider>
    </div>
  );
}

/* The preview waits for its piece faces and painted frames before opening. */
function RenderedTable({ onReady }: { onReady?: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const pieces = useTabletopSelector((table) => table.renderedPieces);
  const frames = useRef(0);
  const complete = useRef(false);
  const pendingFrame = useRef<number | null>(null);
  useEffect(
    () =>
      subscribeArtworkLoads(() => {
        if (!complete.current) {
          invalidate();
        }
      }),
    [invalidate],
  );
  useEffect(
    () => () => {
      if (pendingFrame.current !== null) {
        cancelAnimationFrame(pendingFrame.current);
      }
    },
    [],
  );
  useFrame(() => {
    if (complete.current) {
      return;
    }
    const artworkReady = pieces.every((piece) => {
      const href = topFaceHref(piece);
      return !href || subscribePublishedFace.peek(href) !== undefined;
    });
    if (!artworkReady || unsettledArtworkLoads() > 0) {
      frames.current = 0;
      return;
    }
    if (++frames.current > 3) {
      complete.current = true;
      pendingFrame.current = requestAnimationFrame(() => onReady?.());
    } else {
      invalidate();
    }
  });
  return null;
}

/* Open onto the completed scene once, then load the shared cursors without replacing its canvas. */
function PreviewArrival({ onReady }: { onReady?: () => void }) {
  const [ready, setReady] = useState(false);
  const finish = useCallback(() => {
    setReady(true);
    onReady?.();
  }, [onReady]);
  return (
    <>
      <RenderedTable onReady={finish} />
      {ready && (
        <Suspense fallback={null}>
          <ScenePresence showNames={false} showLocal />
        </Suspense>
      )}
    </>
  );
}
