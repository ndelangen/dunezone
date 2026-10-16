/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import type { ThreeEvent } from '@react-three/fiber/webgpu';
import { retainedArrakisBoard } from '@shared/boards/geometry';
import { isFactionToken } from '@shared/play/factionToken';
import { gestureBlockReason, pieceCount } from '@shared/play/model';
import type { TablePiece, TableState, Vector3Tuple } from '@shared/play/model';
import { peekersOf } from '@shared/play/peeking';
import { CARD_LAYER_STAGGER, stackLayerItemIndex } from '@shared/play/pieceFlip';
import { isPointerToken } from '@shared/play/pointerToken';
import type { GameSnapshot } from '@shared/play/protocol';
import { isSpicePiece, SPICE_LAYER_HEIGHT, SPICE_LAYER_PITCH, SPICE_TOKEN_RADIUS } from '@shared/play/spice';
import { SPICE_TOKEN_HREF } from '@shared/play/spiceToken';
import { pointOnPieceDragRay } from '@shared/play/tableDragGeometry';
import {
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
  BOARD_SURFACE_Y,
} from '@shared/play/tableGeometry';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import type { TableSeatCount } from '@shared/play/tableSettings';
import type { TrackerArcSlot } from '@shared/play/tableTrackers';
import { TRACKER_DISC_HEIGHT } from '@shared/play/tableTrackers';
import { isTroopStack } from '@shared/play/troop';
import clsx from 'clsx';
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
} from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Ray, Texture } from 'three';
import {
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  RingGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
} from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import { ignoreRaycast } from './ignoreRaycast';
import { swallowLift, watchLongPress } from './longPress';
import { MapPreviewCamera } from './MapPreviewCamera';
import { PieceArrival } from './PieceArrival';
import { topFaceHref } from './pieceFaceHref';
import { pieceHasMenu } from './pieceMenu';
import type { CameraViewCommand } from './playView';
import { usePointerSession } from './PointerSessionContext';
import { POINTER_SELECTION_RING, PointerTokenPlate } from './PointerTokenPlate';
import { sharedPublishedFaces } from './publishedFaceRetry';
import { useSharedMeshes } from './sharedMeshes';
import type { SharedMeshes } from './sharedMeshes';
import { SpiceBankInteraction } from './SpiceBank';
import { SpiceStackIcon } from './SpiceStackIcon';
import { useTableFraming } from './tableFraming';
import { isPublicTablePoint } from './tablePointerPoint';
import { TabletopBoard } from './TabletopBoard';
import { TabletopCanvas } from './TabletopCanvas';
import { useTabletop, useTabletopActions, useTabletopCommands, useTabletopSelector } from './TabletopContext';
import type { TabletopContextValue } from './TabletopContext';
import styles from './TabletopScene.module.css';
import type { PieceMenuAnchor } from './TabletopTools';
import type { TableProgress } from './tableTrackers';
import { BRUSH_CURSOR, territoryBrush, useTerritoryBrush } from './territoryBrush';
import { territoryAtTablePoint } from './TerritoryTints';
import { useTurnedDownFaces } from './turnedDownFaces';
import { useDeckShuffleAnimation } from './useDeckShuffleAnimation';
import { usePieceFlipAnimation } from './usePieceFlipAnimation';
import { PlatePosesProvider, useTablePose } from './useTablePose';

type TabletopSceneProps = {
  children?: ReactNode;
  className?: string;
  cameraView?: CameraViewCommand;
  onInteractionActiveChange?: (active: boolean) => void;
  seatCount?: TableSeatCount;
  tableProgress?: TableProgress;
  /* Called when the renderer is ready to draw, the moment there is a table to open the shell onto. */
  onSceneReady?: () => void;
  onSceneUnavailable?: () => void;
  presentation?: 'play' | 'preview';
  /* Absent on the fixture, which has no lifecycle. */
  stage?: GameSnapshot['stage'];
  mapVisible?: boolean;
};

/** The play area's class and style: the paintbrush cursor while the brush is on. */
function usePaintingArea(className: string | undefined) {
  const brush = useTerritoryBrush();
  return brush
    ? { className: clsx(className, styles.painting), style: { '--brush-cursor': BRUSH_CURSOR } as CSSProperties }
    : { className };
}

/** With the paintbrush on, a click on the map adds the territory under it to the brush's tint, or takes it out. */
/* The board's face, where a paint click lands whatever piece the pointer passed through first. */
const BOARD_PLANE = new Plane(new Vector3(0, 1, 0), -BOARD_SURFACE_Y);

function paintTerritory(
  board: GameSnapshot['board'],
  { stage, mapVisible }: Readonly<{ stage: GameSnapshot['stage']; mapVisible?: boolean }>,
  ray: Ray
) {
  const brush = territoryBrush();
  /* Setup keeps the map off the table until it is shown, and nothing can be painted on a map that is not there. */
  const mapShown = stage !== 'setup' || !!mapVisible;
  const point = brush && mapShown && ray.intersectPlane(BOARD_PLANE, new Vector3());
  const territory = point && territoryAtTablePoint(board?.definition ?? retainedArrakisBoard(), point.x, point.z);
  if (brush && territory) {
    brush.paint(territory);
  }
}

const PieceBadge = lazy(() => import('./PieceBadge').then((module) => ({ default: module.PieceBadge })));
const ScenePresence = lazy(() => import('./ScenePresence').then((module) => ({ default: module.ScenePresence })));
const ScenePings = lazy(() => import('./ScenePings').then((module) => ({ default: module.ScenePings })));
const PredictionOverlay = lazy(() =>
  import('./prediction/PredictionOverlay').then((module) => ({ default: module.PredictionOverlay }))
);
const TabletopTools = lazy(() => import('./TabletopTools').then((module) => ({ default: module.TabletopTools })));
const PlayCamera = lazy(() => import('./PlayCamera').then((module) => ({ default: module.PlayCamera })));

const DEFAULT_CAMERA_VIEW: CameraViewCommand = { view: 'map', revision: 0 };
const PHYSICAL_OBJECT_RENDER_ORDER = 2;

/* The item a stack layer shows, counted from the bottom of the layers drawn. */
function layerItemIndex(piece: TablePiece, index: number, shownLayers: number) {
  return stackLayerItemIndex(piece.items.length, shownLayers, index, piece.flipRevision);
}

function stackLayerFaceUp(piece: TablePiece, index: number, shownLayers: number) {
  return piece.items[layerItemIndex(piece, index, shownLayers)]?.faceUp ?? true;
}

function PieceFace({ height, underside, children }: { height: number; underside: boolean; children: ReactNode }) {
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
  load: (href, onLoad, onError) => new TextureLoader().load(href, onLoad, undefined, onError),
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
    (onChange: () => void) => (href ? subscribePublishedFace(href, onChange) : () => {}),
    [href]
  );
  const snapshot = useCallback(() => (href ? subscribePublishedFace.peek(href) : undefined), [href]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/* A token's face: a box token's rectangle at its ratio, or a disc. */
function tokenFaceGeometry(meshes: SharedMeshes, ratio: number | null | undefined) {
  return ratio != null
    ? meshes.plane(TROOP_FACE_RADIUS * 2, TROOP_FACE_RADIUS * 2 * ratio)
    : meshes.circle(TROOP_FACE_RADIUS, 48);
}

const FaceArrivalContext = createContext(false);

function ArrivingFaceMaterial({ texture }: { texture: Texture }) {
  const material = useRef<MeshBasicMaterial>(null);
  const motion = useMotionAllowed();
  const invalidate = useThree((state) => state.invalidate);
  const elapsed = useRef(0);
  useLayoutEffect(() => {
    if (!material.current) {
      return;
    }
    if (!motion) {
      elapsed.current = 0.6;
    }
    const progress = Math.min(1, elapsed.current / 0.6);
    material.current.opacity = progress * progress * (3 - 2 * progress);
    invalidate();
  }, [invalidate, motion]);
  useFrame((_state, delta) => {
    if (!material.current || elapsed.current >= 0.6) {
      return;
    }
    elapsed.current += Math.min(delta, 0.05);
    const progress = Math.min(1, elapsed.current / 0.6);
    material.current.opacity = progress * progress * (3 - 2 * progress);
    invalidate();
  });
  return <meshBasicMaterial ref={material} map={texture} transparent />;
}

function PublishedFace({ href, card, ratio }: { href: string; card: boolean; ratio?: number | null }) {
  const meshes = useSharedMeshes();
  /* Piece art skips useTexture so a missing publication image retries in place instead of suspending the table. */
  const texture = usePublishedFace(href) ?? null;
  const arrive = useContext(FaceArrivalContext);
  const [cached] = useState(() => texture !== null);
  return (
    <mesh
      position={[0, 0, 0.002]}
      renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
      geometry={card ? meshes.plane(CARD_WIDTH, CARD_DEPTH) : tokenFaceGeometry(meshes, ratio)}
    >
      {/* Printed art is drawn unlit: the warm table light washed out card, leader and token faces (#1756). The renderer still tone maps the whole frame in its output pass. The placeholder stays lit, like the piece beneath it. */}
      {texture ? (
        arrive && !cached ? (
          <ArrivingFaceMaterial key={href} texture={texture} />
        ) : (
          <meshBasicMaterial key={href} map={texture} transparent />
        )
      ) : (
        <meshStandardMaterial key="placeholder" color="#d5ba8c" transparent roughness={0.68} metalness={0} />
      )}
    </mesh>
  );
}

/* Holds the image a piece shows on top and says whether it is loaded, so a flip can wait for a card's revealed face instead of turning up a placeholder. */
function usePublishedFaceReady(href: string | undefined): boolean {
  return usePublishedFace(href) !== undefined || !href;
}

/* A card turned face up in hand shows its face only once the room has sent it, so its flip waits for that too. */
function faceStillHidden(piece: TablePiece) {
  const shownLayers = visibleLayerCount(piece);
  const item = piece.items[layerItemIndex(piece, shownLayers - 1, shownLayers)];
  return piece.kind === 'card' && !!item?.faceUp && !!item.artwork && !item.artwork.front;
}

/* A face-down faction token wears a solid black prohibition sign over its front: a ring and the slash across it, the slash as thick as the ring (#1007). */
const SITTING_OUT_OUTER = TROOP_FACE_RADIUS * 0.86;
const SITTING_OUT_INNER = TROOP_FACE_RADIUS * 0.66;
const SITTING_OUT_STROKE = SITTING_OUT_OUTER - SITTING_OUT_INNER;

function SittingOutSign() {
  const meshes = useSharedMeshes();
  return (
    <group position={[0, 0, 0.003]}>
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} geometry={meshes.ring(SITTING_OUT_INNER, SITTING_OUT_OUTER, 64)}>
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh
        rotation={[0, 0, Math.PI / 4]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        geometry={meshes.plane(SITTING_OUT_INNER * 2, SITTING_OUT_STROKE)}
      >
        <meshBasicMaterial color="#000000" />
      </mesh>
    </group>
  );
}

/* Under printed art the plain face wears the piece's own colour: the art's anti-aliased rim lets it through where the disc's corners reach the image's edge, and a light accent there drew a dotted ring. */
function plainTokenFaceColor(piece: TablePiece, faceUp: boolean, printed: boolean) {
  if (printed) {
    return piece.color;
  }
  return faceUp ? piece.accent : '#261c18';
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
  const meshes = useSharedMeshes();
  /* A faction token has no back of its own: face down, it shows its front under a black prohibition sign. */
  const blocked = !faceUp && isFactionToken(piece);
  const href = piece.items[itemIndex]?.artwork?.[faceUp || blocked ? 'front' : 'back'];
  const ratio = tokenBoxRatio(piece);
  return (
    <PieceFace height={TROOP_LAYER_HEIGHT} underside={underside}>
      {href && <PublishedFace href={href} card={false} ratio={ratio} />}
      {blocked && <SittingOutSign />}
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} geometry={tokenFaceGeometry(meshes, ratio)}>
        <meshStandardMaterial color={plainTokenFaceColor(piece, faceUp, !!href)} roughness={0.5} metalness={0.08} />
      </mesh>
      {!faceUp && !piece.items[itemIndex]?.artwork ? (
        <mesh
          position={[0, 0, 0.001]}
          renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
          geometry={meshes.ring(TROOP_FACE_RADIUS * 0.64, TROOP_FACE_RADIUS * 0.78, 48)}
        >
          <meshStandardMaterial color={piece.accent} roughness={0.5} metalness={0.08} />
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
  const meshes = useSharedMeshes();
  const shownLayers = visibleLayerCount(piece);
  const scale = troopScale(piece);
  const ratio = tokenBoxRatio(piece);
  return (
    <group scale={[scale, 1, scale]}>
      {Array.from({ length: shownLayers }, (_, index) => {
        const faceUp = stackLayerFaceUp(piece, index, shownLayers);
        const itemIndex = layerItemIndex(piece, index, shownLayers);
        return (
          <group key={index} position={[0, index * TROOP_LAYER_PITCH, 0]}>
            <mesh
              position={[0, TROOP_LAYER_HEIGHT / 2, 0]}
              renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
              rotation={[0, 0, faceUp ? 0 : Math.PI]}
              geometry={
                ratio != null
                  ? meshes.box(TROOP_TOP_RADIUS * 2, TROOP_LAYER_HEIGHT, TROOP_TOP_RADIUS * 2 * ratio)
                  : meshes.cylinder(TROOP_TOP_RADIUS, TROOP_BOTTOM_RADIUS, TROOP_LAYER_HEIGHT, 48)
              }
            >
              <meshStandardMaterial color={piece.color} roughness={0.56} metalness={0.1} />
            </mesh>
            {index === shownLayers - 1 ? <TokenFace piece={piece} faceUp={faceUp} itemIndex={itemIndex} /> : null}
            {index === 0 ? <TokenFace piece={piece} faceUp={!faceUp} underside itemIndex={itemIndex} /> : null}
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
  const meshes = useSharedMeshes();
  const artwork = piece.items[itemIndex]?.artwork;
  const href = artwork?.[faceUp ? 'front' : 'back'];
  return (
    <PieceFace height={CARD_LAYER_HEIGHT} underside={underside}>
      {href && <PublishedFace href={href} card />}
      {faceUp && artwork?.prediction && (
        <Suspense fallback={null}>
          <PredictionOverlay prediction={artwork.prediction} />
        </Suspense>
      )}
      <mesh renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} geometry={meshes.plane(CARD_WIDTH, CARD_DEPTH)}>
        <meshStandardMaterial color={faceUp ? piece.color : '#2b1a1a'} roughness={0.68} metalness={0.03} />
      </mesh>
      {covered ? null : (
        <mesh position={[0, 0, 0.001]} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} geometry={meshes.plane(0.58, 0.82)}>
          <meshBasicMaterial color={piece.accent} transparent depthWrite={false} opacity={faceUp ? 0.74 : 0.38} />
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
  const meshes = useSharedMeshes();
  const shownLayers = visibleLayerCount(piece);
  return (
    <group>
      {Array.from({ length: shownLayers }, (_, index) => {
        const faceUp = stackLayerFaceUp(piece, index, shownLayers);
        const itemIndex = layerItemIndex(piece, index, shownLayers);
        return (
          <group
            key={index}
            position={[(index - (shownLayers - 1) / 2) * CARD_LAYER_STAGGER, index * CARD_LAYER_PITCH, 0]}
          >
            <mesh
              position={[0, CARD_LAYER_HEIGHT / 2, 0]}
              renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
              geometry={meshes.box(CARD_WIDTH, CARD_LAYER_HEIGHT, CARD_DEPTH)}
            >
              <meshStandardMaterial color="#ead9bb" roughness={0.68} metalness={0.03} />
            </mesh>
            <CardFace piece={piece} faceUp={faceUp} covered={index < shownLayers - 1} itemIndex={itemIndex} />
            <CardFace piece={piece} faceUp={!faceUp} underside covered={index > 0} itemIndex={itemIndex} />
          </group>
        );
      })}
    </group>
  );
}

function MarkerLayers({ piece }: { piece: TablePiece }) {
  const meshes = useSharedMeshes();
  if (isSpicePiece(piece)) {
    return <SpiceLayers piece={piece} />;
  }
  return (
    <group rotation={[0, piece.orientation, 0]}>
      <mesh
        position={[0, MARKER_BASE_HEIGHT / 2, 0]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        geometry={meshes.cylinder(MARKER_TOP_RADIUS, MARKER_BOTTOM_RADIUS, MARKER_BASE_HEIGHT, 8)}
      >
        <meshStandardMaterial color={piece.color} roughness={0.48} metalness={0.28} />
      </mesh>
      <mesh
        position={[0, MARKER_CONE_CENTER_Y, 0]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        rotation={[0, 0.2, 0]}
        geometry={meshes.cone(MARKER_CONE_RADIUS, MARKER_CONE_HEIGHT, 8)}
      >
        <meshStandardMaterial color={piece.accent} roughness={0.45} metalness={0.2} />
      </mesh>
    </group>
  );
}

function SpiceLayers({ piece }: { piece: TablePiece }) {
  const meshes = useSharedMeshes();
  return (
    <group>
      {Array.from({ length: visibleLayerCount(piece) }, (_, index) => (
        <group key={index} position={[0, index * SPICE_LAYER_PITCH, 0]}>
          <mesh
            position={[0, SPICE_LAYER_HEIGHT / 2, 0]}
            renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
            geometry={meshes.cylinder(SPICE_TOKEN_RADIUS, SPICE_TOKEN_RADIUS, SPICE_LAYER_HEIGHT, 48)}
          >
            <meshStandardMaterial color="#b8842f" roughness={0.8} metalness={0} />
          </mesh>
          <SpiceFace />
        </group>
      ))}
    </group>
  );
}

/* Each layer wears the published spice token; until it loads, or where it is unavailable, a plain face with the spice icon stands in. */
function SpiceFace() {
  const meshes = useSharedMeshes();
  const texture = usePublishedFace(SPICE_TOKEN_HREF);
  if (texture) {
    return (
      <mesh
        position={[0, SPICE_LAYER_HEIGHT + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        geometry={meshes.circle(SPICE_TOKEN_RADIUS, 48)}
      >
        {/* Printed art is drawn unlit, like every other piece face (#1756). */}
        <meshBasicMaterial map={texture} />
      </mesh>
    );
  }
  return (
    <>
      <mesh
        position={[0, SPICE_LAYER_HEIGHT + 0.001, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
        geometry={meshes.circle(SPICE_TOKEN_RADIUS * 0.79, 48)}
      >
        <meshStandardMaterial color="#f6d77f" roughness={1} metalness={0} />
      </mesh>
      <SpiceStackIcon y={SPICE_LAYER_HEIGHT} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} />
    </>
  );
}

/*
 * What a piece shows besides itself, worked out by the scene so each piece receives plain values.
 * A piece renders again only when one of them or the piece changes, not on every update to the table.
 */
export type PieceSceneState = {
  selected: boolean;
  stackTargeted: boolean;
  drafted: boolean;
  remoteCarried: boolean;
  /* The plate in someone's hand that this piece rides, which it follows as the plate is shown. */
  ridingPlateId: string | undefined;
  locallyCarried: boolean;
  reserved: boolean;
  interactionBlocked: boolean;
  canHandleTable: boolean;
  /* No piece opens its menu while a piece is in hand. */
  carrying: boolean;
  owner: string | undefined;
  /* Who peeked at the piece, as its tag says it under the name. */
  peeked: string | undefined;
};

type TablePieceMeshProps = { piece: TablePiece; showLabels?: boolean; arrivalDelay?: number } & PieceSceneState;

function pieceSceneState(
  piece: TablePiece,
  {
    state,
    gestureActivePieceId,
    canHandleTable,
    remoteCarriedIds,
    plateRiders,
    reservedPieceIds,
  }: Pick<
    TabletopContextValue,
    'state' | 'gestureActivePieceId' | 'canHandleTable' | 'remoteCarriedIds' | 'plateRiders' | 'reservedPieceIds'
  >
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
    ridingPlateId: plateRiders.get(piece.id),
    locallyCarried: drafted && gestureActivePieceId !== null,
    reserved,
    interactionBlocked: !canHandleTable || remoteCarried || (reserved && !localSource),
    canHandleTable,
    carrying: Boolean(state.draftMove),
    owner: pieceOwnerName(piece, state),
    peeked: peekedLine(piece, state),
  };
}

/* "Fremen peeked at this", naming every faction that peeked at a card or token of the piece. */
function peekedLine(piece: TablePiece, state: Pick<TableState, 'factionNames'>) {
  const names = peekersOf(piece).map((id) => state.factionNames[id] ?? id);
  if (!names.length) {
    return undefined;
  }
  const who = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${who} peeked at this`;
}

function useTablePointFromClient() {
  const { camera, renderer } = useThree();
  const normalizedPointer = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  const pointFromClient = useCallback(
    (piece: TablePiece, clientX: number, clientY: number): Vector3Tuple | null => {
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
    [camera, normalizedPointer, raycaster, renderer.domElement]
  );

  return pointFromClient;
}

function useScenePointerSession(onActiveChange: (active: boolean) => void) {
  const session = usePointerSession();
  const { state, beginGesture, updateGesture, finishGesture, cancelDraft, canHandleTable, publishPointer } =
    useTabletop();
  const { renderer } = useThree();
  const point = useTablePointFromClient();
  const controls = {
    canHandleTable,
    hasDraft: Boolean(state.draftMove),
    piece: (id: string) => state.pieces.find((piece) => piece.id === id),
    point,
    isPublicPoint: (x: number, y: number) => isPublicTablePoint(renderer.domElement, x, y),
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
    () => session.bind({ events: window, canvas: renderer.domElement, read: () => live.current }),
    [renderer.domElement, session]
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
  const connected = useThree((state) => state.events.connected as EventTarget | undefined);
  const cancel = useThree((state) => state.events.handlers?.onPointerCancel);
  const internal = useThree((state) => state.internal);
  const { renderer } = useThree();
  useEffect(() => {
    if (!connected || !cancel) {
      return;
    }
    const canvas = renderer.domElement;
    const leave = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') {
        cancel(event);
      }
    };
    const cancelAll = () => {
      for (const pointerId of internal.pointerMap.keys()) {
        cancel(new PointerEvent('pointercancel', { pointerId }));
      }
    };
    const hidden = () => {
      if (document.visibilityState === 'hidden') {
        cancelAll();
      }
    };
    connected.addEventListener('pointerleave', leave as EventListener);
    canvas.addEventListener('pointerleave', leave);
    window.addEventListener('blur', cancelAll);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      connected.removeEventListener('pointerleave', leave as EventListener);
      canvas.removeEventListener('pointerleave', leave);
      window.removeEventListener('blur', cancelAll);
      document.removeEventListener('visibilitychange', hidden);
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
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Game table');
  }, [renderer]);
}

function pieceHoverCursor(canInteract: boolean, interactionBlocked: boolean, gestureBlocked: boolean) {
  if (interactionBlocked) {
    return canInteract ? 'not-allowed' : 'default';
  }
  return gestureBlocked ? 'not-allowed' : 'grab';
}

/* Opens a piece's menu at a point; `touch` says a finger asked for it, which has no keyboard shortcut to offer. */
const PieceMenuContext = createContext<((pieceId: string, x: number, y: number, touch: boolean) => void) | null>(null);

function usePiecePointerEvents({ piece, interactionBlocked, canHandleTable, carrying }: TablePieceMeshProps) {
  const { selectPiece, setHoveredPiece } = useTabletopActions();
  const openPieceMenu = useContext(PieceMenuContext);
  /* A selector, so a change elsewhere in the scene's store does not render every piece again. */
  const get = useThree((state) => state.get);
  const pointerSession = usePointerSession();
  const gestureBlocked = gestureBlockReason(piece);
  const hasMenu = !carrying && pieceHasMenu(piece);
  const stopLongPress = useRef<(() => void) | null>(null);
  useEffect(() => () => stopLongPress.current?.(), []);
  /* Only a left press handles a piece, and none does while the table blocks it or the paintbrush is on. */
  const ignoresPress = (event: ThreeEvent<PointerEvent>) => {
    const notLeftOrBlocked = event.button !== 0 || interactionBlocked;
    return notLeftOrBlocked || territoryBrush() !== null;
  };
  /* A piece that leaves the table under a still cursor hears no pointer leave, so its hover would keep the keys aimed at a piece that is gone. */
  const hovered = useRef(false);
  useEffect(
    () => () => {
      if (hovered.current) {
        setHoveredPiece(null);
      }
    },
    [setHoveredPiece]
  );

  return {
    onContextMenu: (event: ThreeEvent<MouseEvent>) => {
      if (hasMenu && openPieceMenu) {
        event.stopPropagation();
        const { clientX, clientY } = event.nativeEvent;
        /* Android's long-press context menu is a touch pointer event. */
        const touch = 'pointerType' in event.nativeEvent && event.nativeEvent.pointerType === 'touch';
        openPieceMenu(piece.id, clientX, clientY, touch);
      }
    },
    /* While the paintbrush is on, a click on a piece paints the territory under it, and the piece is neither picked up nor selected. */
    onClick: (event: ThreeEvent<MouseEvent>) => {
      if (!territoryBrush()) {
        event.stopPropagation();
      }
    },
    onPointerDown: (event: ThreeEvent<PointerEvent>) => {
      if (ignoresPress(event)) {
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
      if (event.pointerType === 'touch' && hasMenu && openPieceMenu) {
        const { clientX, clientY } = event.nativeEvent;
        stopLongPress.current = watchLongPress(window, event.nativeEvent, () => {
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
        });
      }
      if (gestureBlocked) {
        return;
      }
      pointerSession.press(event.nativeEvent, piece.id);
    },
    onPointerEnter: (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      /* A finger has no hover: its leave is never heard, so a tap's jitter would leave the piece armed for the keys after the selection moves on. */
      if (event.pointerType === 'touch') {
        return;
      }
      if (!interactionBlocked) {
        hovered.current = true;
        setHoveredPiece(piece.id);
      }
      get().renderer.domElement.style.cursor = pieceHoverCursor(
        canHandleTable,
        interactionBlocked,
        Boolean(gestureBlocked)
      );
    },
    onPointerLeave: () => {
      hovered.current = false;
      setHoveredPiece(null);
      if (!pointerSession.isDragging(piece.id)) {
        get().renderer.domElement.style.cursor = 'default';
      }
    },
  };
}

const PIECE_SELECTION_RING_MATERIAL = { transparent: true, opacity: 0.92 } as const;

const PIECE_SELECTION_RADII: Record<TablePiece['kind'], [number, number, number]> = {
  card: [0.7, 0.78, 64],
  force: [0.2, 0.235, 64],
  marker: [0.4, 0.47, 64],
};

const SPICE_SELECTION_RADII: [number, number, number] = [0.18, 0.205, 64];

function selectionRadii(piece: TablePiece): [number, number, number] {
  const [inner, outer, segments] = PIECE_SELECTION_RADII[piece.kind];
  const scale = troopScale(piece);
  return [inner * scale, outer * scale, segments];
}

/* A plate's ring follows its teardrop; every other piece's is round. */
function selectionRingGeometry(meshes: ReturnType<typeof useSharedMeshes>, piece: TablePiece) {
  if (isPointerToken(piece)) {
    return POINTER_SELECTION_RING;
  }
  return meshes.ring(...(isSpicePiece(piece) ? SPICE_SELECTION_RADII : selectionRadii(piece)));
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
  const meshes = useSharedMeshes();
  return (
    <mesh
      position={[0, shadowLocalY + CONTACT_SHADOW_EPSILON, 0]}
      renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={selectionRingGeometry(meshes, piece)}
    >
      <meshBasicMaterial
        color={stackTargeted ? '#f6bd55' : drafted ? '#f6c879' : '#fff0c9'}
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

/* A pointer token shows the face it lies on: its front face up, its back face down. */
function PointerTokenLayers({ piece }: { piece: TablePiece }) {
  const item = piece.items[0];
  const front = usePublishedFace(item?.artwork?.front);
  const back = usePublishedFace(item?.artwork?.back);
  const [face, under] = item?.faceUp ? [front, back] : [back, front];
  return <PointerTokenPlate piece={piece} face={face} under={under} renderOrder={PHYSICAL_OBJECT_RENDER_ORDER} />;
}

export function TabletopPieceLayers({ piece }: { readonly piece: TablePiece }) {
  if (isPointerToken(piece)) {
    return <PointerTokenLayers piece={piece} />;
  }
  if (piece.kind === 'marker') {
    return <MarkerLayers piece={piece} />;
  }
  return piece.kind === 'card' ? <CardStackLayers piece={piece} /> : <TroopStackLayers piece={piece} />;
}

function PieceLock({ piece }: { piece: TablePiece }) {
  const meshes = useSharedMeshes();
  if (!piece.locked) {
    return null;
  }
  const lock = (
    <mesh
      position={[0.3, 0.42, 0.2]}
      renderOrder={PHYSICAL_OBJECT_RENDER_ORDER}
      geometry={meshes.box(0.16, 0.19, 0.09)}
    >
      <meshStandardMaterial color="#251912" roughness={0.6} metalness={0.3} />
    </mesh>
  );
  return piece.kind === 'force' ? <group scale={0.5 * troopScale(piece)}>{lock}</group> : lock;
}

/*
 * The faction that owns a piece, by its display name; a shared piece, or an owner the roster does not name, has none.
 * A label that already carries the name ('Atreides troops', 'Atreides alliance') names it once, and when another
 * seat's faction shares that name the badge adds only what tells them apart (#1667).
 */
function pieceOwnerName(piece: TablePiece, state: Pick<TableState, 'factionNames' | 'factionTieBreaks'>) {
  const owner = piece.owner === 'shared' ? undefined : state.factionNames[piece.owner];
  if (!owner) {
    return undefined;
  }
  const tieBreak = state.factionTieBreaks?.[piece.owner];
  if (piece.label.includes(owner)) {
    return tieBreak;
  }
  return tieBreak ? `${owner} (${tieBreak})` : owner;
}

const PIECE_BADGE_CLASS_NAMES = {
  pieceTag: styles.pieceTag,
  pieceName: styles.pieceName,
  pieceNameOwner: styles.pieceNameOwner,
  pieceNamePeeked: styles.pieceNamePeeked,
  pieceCount: styles.pieceCount,
  pieceCountSelected: styles.pieceCountSelected,
};

const TablePieceMesh = memo(function TablePieceMesh(props: TablePieceMeshProps) {
  const meshes = useSharedMeshes();
  const {
    piece,
    drafted,
    remoteCarried,
    ridingPlateId,
    locallyCarried,
    reserved,
    selected,
    stackTargeted,
    owner,
    peeked,
  } = props;
  const { finishPieceFlip } = useTabletopActions();
  const pointerEvents = usePiecePointerEvents(props);
  const displayedCount = pieceCount(piece);
  const emptyProjection = displayedCount === 0;
  const carried = locallyCarried || remoteCarried;
  const poseRef = useTablePose(piece.position, piece.orientation, remoteCarried, locallyCarried, {
    plateId: isPointerToken(piece) ? piece.id : undefined,
    follows: ridingPlateId,
  });
  const faceReady = usePublishedFaceReady(topFaceHref(piece)) && !faceStillHidden(piece);
  /* A held piece turns over in hand too, so only an emptied projection cuts a flip short. */
  const { pivotRef, labelRef, shadowRef, badgeRef } = usePieceFlipAnimation(
    piece,
    emptyProjection,
    finishPieceFlip,
    faceReady
  );
  const shuffleRef = useDeckShuffleAnimation(piece, carried || emptyProjection);
  const drawnPiece = useTurnedDownFaces(piece);
  const flipPivotY = stackTopHeight(piece) / 2;
  const shadowLocalY = contactShadowHeightAt(piece.position, piece) - piece.position[1];

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
          selected,
        },
      }}
      {...pointerEvents}
    >
      {!emptyProjection ? (
        <>
          <group ref={shadowRef}>
            <mesh
              rotation-x={-Math.PI / 2}
              position={[0, shadowLocalY, 0]}
              renderOrder={1}
              scale={contactShadowScale(piece, carried)}
              raycast={ignoreRaycast}
              geometry={meshes.plane()}
            >
              <meshBasicMaterial
                transparent
                opacity={contactShadowOpacity(carried, piece)}
                fog={false}
                depthWrite={false}
                side={DoubleSide}
              >
                {/* Attached as drei attached its own: a `map` property would have Fiber mark the texture sRGB and darken the shadow. */}
                <primitive object={meshes.contactShadow('#100906', 0.18)} attach="map" />
              </meshBasicMaterial>
            </mesh>
          </group>
          {selected || stackTargeted ? (
            <PieceSelectionRing
              piece={piece}
              shadowLocalY={shadowLocalY}
              stackTargeted={stackTargeted}
              drafted={drafted}
            />
          ) : null}
          <PieceArrival delay={props.arrivalDelay} interaction={props}>
            <group ref={pivotRef} position={[0, flipPivotY, 0]}>
              <group position={[0, -flipPivotY, 0]}>
                <group ref={shuffleRef}>
                  <TabletopPieceLayers piece={drawnPiece} />
                </group>
              </group>
            </group>
            <PieceLock piece={piece} />
            {props.showLabels !== false && (
              <Suspense fallback={null}>
                <PieceBadge
                  classNames={PIECE_BADGE_CLASS_NAMES}
                  piece={piece}
                  owner={owner}
                  peeked={peeked}
                  selected={selected}
                  labelRef={labelRef}
                  badgeRef={badgeRef}
                />
              </Suspense>
            )}
          </PieceArrival>
        </>
      ) : null}
    </group>
  );
});

function useSceneInteractions(onInteractionActiveChange: TabletopSceneProps['onInteractionActiveChange']) {
  const gestureActivePieceId = useTabletopSelector((table) => table.gestureActivePieceId);
  const [pointerActive, setPointerActive] = useState(false);
  const onPointerSessionChange = useCallback(
    (nextActive: boolean) => {
      setPointerActive(nextActive);
      if (nextActive) {
        onInteractionActiveChange?.(true);
      }
    },
    [onInteractionActiveChange]
  );
  const sceneInteractionActive = pointerActive || gestureActivePieceId !== null;

  useEffect(() => {
    onInteractionActiveChange?.(sceneInteractionActive);
  }, [onInteractionActiveChange, sceneInteractionActive]);
  useEffect(() => () => onInteractionActiveChange?.(false), [onInteractionActiveChange]);

  return {
    controlsEnabled: !gestureActivePieceId && !pointerActive,
    onPointerSessionChange,
  };
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
  drawBoard = true,
}: Pick<
  TabletopSceneProps,
  'cameraView' | 'onInteractionActiveChange' | 'seatCount' | 'tableProgress' | 'stage' | 'mapVisible' | 'presentation'
> & {
  drawBoard?: boolean;
  trackerSlots: readonly TrackerArcSlot[];
  mapFramingPoints: readonly Vector3Tuple[];
}) {
  const table = useTabletop();
  const board = useTabletopSelector((value) => value.snapshot.board);
  const tints = useTabletopSelector((value) => value.snapshot.tints);
  const { state, renderedPieces, selectPiece } = table;
  const { controlsEnabled, onPointerSessionChange } = useSceneInteractions(onInteractionActiveChange);
  useScenePointerSession(onPointerSessionChange);
  useCanvasHoverReset();
  useCanvasName();

  return (
    <>
      {presentation !== 'preview' && (
        <>
          <color attach="background" args={['#130d0a']} />
          <fog attach="fog" args={['#130d0a', 10, 22]} />
        </>
      )}
      {presentation !== 'preview' && (
        <Suspense fallback={null}>
          <ScenePresence showNames trackerSlots={trackerSlots} />
          <ScenePings />
        </Suspense>
      )}
      <group
        onClick={(event) => {
          /* A click reaches here once for each mesh the pointer passed through; the paintbrush handles it once, on the board's face. */
          if (territoryBrush()) {
            event.stopPropagation();
            paintTerritory(board, { stage, mapVisible }, event.ray);
          }
          selectPiece(null);
        }}
      >
        {drawBoard && (
          <TabletopBoard
            board={board}
            tints={tints}
            seatCount={seatCount}
            interactive
            stormSectorIndex={state.stormSectorIndex}
            stage={stage}
            mapVisible={mapVisible}
            tableProgress={tableProgress}
            trackerSlots={trackerSlots}
          />
        )}
        <PlatePosesProvider>
          {renderedPieces
            /* Troop reserves arrive with the board: setup keeps them off the table until the map shows. */
            .filter((piece) => !piece.battleOverlay && (stage !== 'setup' || mapVisible || !isTroopStack(piece)))
            .map((piece, index) => (
              <TablePieceMesh
                showLabels={presentation !== 'preview'}
                arrivalDelay={presentation === 'preview' ? Math.min(index * 32, 320) : undefined}
                key={piece.id}
                piece={piece}
                {...pieceSceneState(piece, table)}
              />
            ))}
        </PlatePosesProvider>
      </group>
      {presentation === 'preview' ? (
        <MapPreviewCamera mapFramingPoints={mapFramingPoints} />
      ) : (
        <Suspense fallback={<MapPreviewCamera mapFramingPoints={mapFramingPoints} />}>
          <PlayCamera enabled={controlsEnabled} command={cameraView} mapFramingPoints={mapFramingPoints} />
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
  presentation = 'play',
  stage,
  mapVisible,
}: TabletopSceneProps) {
  const { takeAdditionalFromTarget } = useTabletopCommands();
  /* The frame around the canvas follows only what it shows, so a held piece moving renders the pieces and not the canvas. */
  const hasDraft = useTabletopSelector((table) => table.state.draftMove !== null);
  const menuAvailable = useTabletopSelector((table) =>
    [table.deckControls, table.spiceReserveControls, table.peekControls, table.deleteControls].some(Boolean)
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
    []
  );
  const { tableProgress, trackerSlots, mapFramingPoints, camera } = useTableFraming(stage, providedProgress, seatCount);
  const areaRef = useRef<HTMLDivElement>(null);
  const painting = usePaintingArea(className);

  return (
    <div
      ref={areaRef}
      {...painting}
      onContextMenu={(event) => {
        event.preventDefault();
        if (hasDraft) {
          takeAdditionalFromTarget();
        }
      }}
    >
      {presentation === 'play' && (
        <Suspense fallback={null}>
          <TabletopTools
            pieceMenu={pieceMenu}
            onMenuChange={setPieceMenu}
            area={areaRef}
            keyboardActionsClassName={styles.keyboardActions}
          />
        </Suspense>
      )}
      <PieceMenuContext.Provider value={presentation === 'play' && menuAvailable ? openPieceMenu : null}>
        <TabletopCanvas
          camera={camera}
          presentation={presentation}
          onSceneReady={onSceneReady}
          onSceneUnavailable={onSceneUnavailable}
        >
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
        </TabletopCanvas>
      </PieceMenuContext.Provider>
    </div>
  );
}

/** Adds live pieces and pointer presence to an already-painted preview canvas. */
export function TabletopPreviewContents({
  demo,
  stage,
  seatCount,
  mapVisible,
  tableProgress,
  trackerSlots,
  mapFramingPoints,
}: Pick<TabletopSceneProps, 'stage' | 'mapVisible' | 'tableProgress'> & {
  demo?: ReactNode;
  seatCount: TableSeatCount;
  trackerSlots: readonly TrackerArcSlot[];
  mapFramingPoints: readonly Vector3Tuple[];
}) {
  return (
    <FaceArrivalContext value={true}>
      {trackerSlots
        .filter((slot) => slot.kind === 'spice')
        .map((slot) => (
          <group key={slot.kind} position={slot.position}>
            <group position={[0, TRACKER_DISC_HEIGHT, 0]}>
              <SpiceBankInteraction radius={slot.radius} />
            </group>
          </group>
        ))}
      <SceneContents
        drawBoard={false}
        presentation="preview"
        stage={stage}
        seatCount={seatCount}
        mapVisible={mapVisible}
        tableProgress={tableProgress}
        trackerSlots={trackerSlots}
        mapFramingPoints={mapFramingPoints}
      />
      <Suspense fallback={null}>
        <ScenePresence showNames={false} showLocal trackerSlots={trackerSlots} />
        {demo}
      </Suspense>
    </FaceArrivalContext>
  );
}
