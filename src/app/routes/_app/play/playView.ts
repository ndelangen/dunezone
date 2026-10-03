import type { Vector3Tuple } from '@shared/play/model';
import type { TablePhaseId } from '@shared/play/phases';
import { PerspectiveCamera, Vector3 } from 'three';

import { mapViewFramingPoints } from './tablePlateGeometry';

export const TABLE_VIEW_OPTIONS = [
  { id: 'map', label: 'Map' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'bottom', label: 'Bottom' },
] as const;

export type TableView = (typeof TABLE_VIEW_OPTIONS)[number]['id'];

/** The view each phase recommends: the camera moves there when the phase begins, and the view picker marks it. */
export const PHASE_VIEWS: Record<TablePhaseId, TableView> = {
  storm: 'map',
  'spice-blow': 'right',
  'choam-charity': 'bottom',
  bidding: 'left',
  revival: 'bottom',
  'shipment-and-movement': 'map',
  battle: 'map',
  'spice-collection': 'map',
  'mentat-pause': 'bottom',
};

export type CameraViewCommand = Readonly<{
  view: TableView;
  revision: number;
}>;

type PendingView = Readonly<{ view: TableView; source: 'player' | 'phase' }>;

export type TableViewState = Readonly<{
  activeView: TableView;
  cameraRevision: number;
  interactionActive: boolean;
  /* Whether the renderer is ready to draw: the shell opens through its iris only once there is a table to see. */
  sceneReady: boolean;
  /* A view asked for during an interaction, applied when it ends. */
  pendingView: PendingView | null;
  /* The active phase the camera last answered, so only a change of phase moves it. */
  phase: TablePhaseId | null;
}>;

export type TableViewEvent =
  | Readonly<{ type: 'view.selected'; view: TableView }>
  | Readonly<{ type: 'phase.changed'; phase: TablePhaseId | null }>
  | Readonly<{ type: 'interaction.changed'; active: boolean }>
  | Readonly<{ type: 'scene.ready' }>;

export type CameraPose = Readonly<{
  position: Vector3Tuple;
  target: Vector3Tuple;
}>;

export type CameraFogRange = Readonly<{
  near: number;
  far: number;
}>;

export const CAMERA_VIEW_TRANSITION_MS = 300;
export const TABLE_CAMERA_FIELD_OF_VIEW = 42;
export const TABLE_CAMERA_NEAR = 0.1;
export const TABLE_CAMERA_FAR = 100;
export const MAP_VIEW_HORIZONTAL_LIMIT = 0.92;
export const MAP_VIEW_TOP_LIMIT = 0.68;
export const MAP_VIEW_BOTTOM_LIMIT = 0.9;
export const MAP_VIEW_MINIMUM_CAMERA_SCALE = 0.8;
const MAP_VIEW_HEADER_PADDING_PX = 12;
const MAP_VIEW_MINIMUM_TOP_LIMIT = 0.08;
/* Where the header covers this much of the canvas's upper half, the map view looks wholly at the balanced target. */
const MAP_VIEW_BALANCED_TOP_LIMIT = 0.38;

const CAMERA_OFFSET: Vector3Tuple = [0, 9.4, 11.2];
const CAMERA_OFFSET_LENGTH = Math.hypot(...CAMERA_OFFSET);
/* The approved table angle, measured from straight down, and the steepest the player may tilt to: near top-down, short of the pole where the orbit loses its heading. */
const CAMERA_APPROVED_POLAR_ANGLE = Math.atan2(CAMERA_OFFSET[2], CAMERA_OFFSET[1]);
export const CAMERA_TOP_DOWN_POLAR_ANGLE = 0.2;
/* Scroll distance, in pixels, that tilts the camera from the approved angle all the way to top-down. */
const CAMERA_TILT_SCROLL_RANGE_PX = 600;
const WHEEL_LINE_PX = 16;
const WHEEL_PAGE_PX = 400;
const CAMERA_TANGENT = Math.tan((TABLE_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
const DEFAULT_MAP_VIEW_FRAMING_POINTS = mapViewFramingPoints([]);
const CAMERA_FOG_REFERENCE_HEIGHT = CAMERA_OFFSET[1];
const CAMERA_FOG_NEAR = 10;
const CAMERA_FOG_FAR = 22;
const FOCUS_VIEW_CAMERA_SCALE = 0.68;
const BOTTOM_VIEW_MINIMUM_HORIZONTAL_SCALE = 0.62;
const BOTTOM_VIEW_CAMERA_SCALE = 0.74;
const SIDE_VIEW_TARGET_X = 4.47;
const SIDE_VIEW_WIDE_ASPECT = 1;
const SIDE_VIEW_ASPECT_COMPENSATION = 2.85;
const SIDE_VIEW_MAX_TARGET_X = 6.1;
const MAP_VIEW_TARGET_Z = 0.8;
const MAP_VIEW_TARGET_SEARCH_RANGE = 12;
const MAP_VIEW_TARGET_SEARCH_STEPS = 48;

const TABLE_VIEW_TARGETS: Record<TableView, Vector3Tuple> = {
  map: [0, 0.1, MAP_VIEW_TARGET_Z],
  left: [-SIDE_VIEW_TARGET_X, 0.1, 0],
  right: [SIDE_VIEW_TARGET_X, 0.1, 0],
  bottom: [0, 0.1, 5.15],
};

/* The camera's direction from its target and its screen axes at a tilt: 0 is the approved angle, 1 is near top-down. */
type CameraBasis = Readonly<{ offset: Vector3Tuple; forward: Vector3Tuple; up: Vector3Tuple }>;

/** A tilt within its range, where 0 is the approved table angle and 1 is near top-down. */
function clampCameraTilt(tilt: number): number {
  return Number.isFinite(tilt) ? Math.max(0, Math.min(1, tilt)) : 0;
}

/** The tilt after a wheel turn: scrolling down raises the camera toward top-down, scrolling up lowers it back to the approved angle. */
export function cameraTiltAfterWheel(tilt: number, deltaY: number, deltaMode = 0): number {
  const pixels = deltaY * (deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1);
  return Number.isFinite(pixels) ? clampCameraTilt(tilt + pixels / CAMERA_TILT_SCROLL_RANGE_PX) : clampCameraTilt(tilt);
}

function cameraBasisFor(tilt: number): CameraBasis {
  const polarAngle =
    CAMERA_APPROVED_POLAR_ANGLE + (CAMERA_TOP_DOWN_POLAR_ANGLE - CAMERA_APPROVED_POLAR_ANGLE) * clampCameraTilt(tilt);
  const height = Math.cos(polarAngle);
  const depth = Math.sin(polarAngle);
  return {
    offset: [0, height * CAMERA_OFFSET_LENGTH, depth * CAMERA_OFFSET_LENGTH],
    forward: [0, -height, -depth],
    up: [0, depth, -height],
  };
}

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function mapCameraScaleFor(
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  topLimit: number,
  basis: CameraBasis,
  target: Vector3Tuple = TABLE_VIEW_TARGETS.map
): number {
  return framingPoints.reduce((requiredScale, point) => {
    const relativePoint: Vector3Tuple = [point[0] - target[0], point[1] - target[1], point[2] - target[2]];
    const depthAtTarget = dot(relativePoint, basis.forward);
    const viewHeight = dot(relativePoint, basis.up);
    const horizontalDepth = Math.abs(relativePoint[0]) / (CAMERA_TANGENT * MAP_VIEW_HORIZONTAL_LIMIT * aspectRatio);
    const verticalDepth =
      viewHeight >= 0
        ? viewHeight / (CAMERA_TANGENT * topLimit)
        : -viewHeight / (CAMERA_TANGENT * MAP_VIEW_BOTTOM_LIMIT);
    const pointScale = (Math.max(horizontalDepth, verticalDepth) - depthAtTarget) / CAMERA_OFFSET_LENGTH;
    return Math.max(requiredScale, pointScale);
  }, MAP_VIEW_MINIMUM_CAMERA_SCALE);
}

/*
 * Where along the table's depth the tilted map view looks, so the frame sits between header and dock with the camera closest.
 * The required scale is the maximum of functions linear in the target's depth, so it is convex there and a ternary search finds its floor.
 * The approved angle keeps its approved target; a tilt blends toward this one so the map grows as it turns, instead of drifting toward the header.
 * A header that covers much of the canvas blends toward it too: a phone's header can take most of the canvas's upper half,
 * and the approved target, at the canvas's middle, would then push the camera far back and leave the lower half empty.
 */
function tiltedMapTarget(
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  topLimit: number,
  basis: CameraBasis,
  tilt: number
): Vector3Tuple {
  const approved = TABLE_VIEW_TARGETS.map;
  const headerShare = Math.max(
    0,
    Math.min(1, (MAP_VIEW_TOP_LIMIT - topLimit) / (MAP_VIEW_TOP_LIMIT - MAP_VIEW_BALANCED_TOP_LIMIT))
  );
  const blend = Math.max(tilt, headerShare);
  if (blend <= 0) {
    return [...approved];
  }
  const scaleAt = (depth: number) =>
    mapCameraScaleFor(aspectRatio, framingPoints, topLimit, basis, [approved[0], approved[1], depth]);
  let near = approved[2] - MAP_VIEW_TARGET_SEARCH_RANGE;
  let far = approved[2] + MAP_VIEW_TARGET_SEARCH_RANGE;
  for (let step = 0; step < MAP_VIEW_TARGET_SEARCH_STEPS; step++) {
    const lower = near + (far - near) / 3;
    const upper = far - (far - near) / 3;
    if (scaleAt(lower) <= scaleAt(upper)) {
      far = upper;
    } else {
      near = lower;
    }
  }
  const balanced = (near + far) / 2;
  return [approved[0], approved[1], approved[2] + (balanced - approved[2]) * blend];
}

export function mapViewTopLimitForViewport(
  canvasHeight: number,
  headerHeight: number,
  padding = MAP_VIEW_HEADER_PADDING_PX
): number {
  if (!Number.isFinite(canvasHeight) || canvasHeight <= 0) {
    return MAP_VIEW_TOP_LIMIT;
  }
  if (!Number.isFinite(headerHeight) || headerHeight <= 0) {
    return MAP_VIEW_TOP_LIMIT;
  }
  const safePadding = Number.isFinite(padding) ? Math.max(0, padding) : 0;
  const unobscuredTop = 1 - (2 * (headerHeight + safePadding)) / canvasHeight;
  return Math.max(MAP_VIEW_MINIMUM_TOP_LIMIT, Math.min(MAP_VIEW_TOP_LIMIT, unobscuredTop));
}

export function cameraPoseFor(
  view: TableView,
  aspectRatio = 1,
  mapFramingPoints: readonly Vector3Tuple[] = DEFAULT_MAP_VIEW_FRAMING_POINTS,
  mapTopLimit = MAP_VIEW_TOP_LIMIT,
  tilt = 0
): CameraPose {
  const basis = cameraBasisFor(tilt);
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const baseTarget = TABLE_VIEW_TARGETS[view];
  const safeMapTopLimit =
    Number.isFinite(mapTopLimit) && mapTopLimit > 0 ? Math.min(MAP_VIEW_TOP_LIMIT, mapTopLimit) : MAP_VIEW_TOP_LIMIT;
  const narrowViewOffset = Math.max(0, SIDE_VIEW_WIDE_ASPECT - safeAspectRatio) * SIDE_VIEW_ASPECT_COMPENSATION;
  const sideTargetX = Math.min(SIDE_VIEW_MAX_TARGET_X, SIDE_VIEW_TARGET_X + narrowViewOffset);
  const target: Vector3Tuple =
    view === 'left'
      ? [-sideTargetX, baseTarget[1], baseTarget[2]]
      : view === 'right'
        ? [sideTargetX, baseTarget[1], baseTarget[2]]
        : view === 'map'
          ? tiltedMapTarget(safeAspectRatio, mapFramingPoints, safeMapTopLimit, basis, clampCameraTilt(tilt))
          : [...baseTarget];
  const cameraScale =
    view === 'map'
      ? mapCameraScaleFor(safeAspectRatio, mapFramingPoints, safeMapTopLimit, basis, target)
      : view === 'bottom'
        ? Math.max(BOTTOM_VIEW_CAMERA_SCALE, BOTTOM_VIEW_MINIMUM_HORIZONTAL_SCALE / safeAspectRatio)
        : FOCUS_VIEW_CAMERA_SCALE;
  return {
    target: [...target],
    position: [
      target[0] + basis.offset[0] * cameraScale,
      target[1] + basis.offset[1] * cameraScale,
      target[2] + basis.offset[2] * cameraScale,
    ],
  };
}

/*
 * A close look at the board: the pose scaled about a point on the table, so that point stays under the pointer.
 * `scale` is how far the camera is from where it would be (1 is today's view, smaller is closer), and `offset` is where the scaling moved it,
 * so a zoomed pose is `pose * scale + offset` for both the camera and its target.
 */
export type CameraZoom = Readonly<{ scale: number; offset: Vector3Tuple }>;

export const NO_CAMERA_ZOOM: CameraZoom = { scale: 1, offset: [0, 0, 0] };
/* The closest look, as a share of the view's distance. The camera also turns toward top-down as it closes in, which costs some of the gain. */
const CAMERA_ZOOM_MINIMUM_SCALE = 0.2;
/* How far toward top-down the closest look turns: most of the way, while every wheel notch still brings the board closer. */
const CAMERA_ZOOM_FULL_TILT = 0.85;
/*
 * How quickly the pan keys slide a close look, in table units per second at the view's own distance; closer looks slide slower.
 * A held key starts at the first speed and builds to the second over the ramp; the look eases into and out of its speed.
 */
const CAMERA_PAN_START_SPEED = 10;
const CAMERA_PAN_TOP_SPEED = 24;
const CAMERA_PAN_RAMP_S = 1.2;
const CAMERA_PAN_EASE_S = 0.12;
/* Within this distance of the edge a close look may reach, sliding further out slows to a stop. */
const CAMERA_PAN_EDGE_MARGIN = 1.2;
/* Scroll distance, in pixels, that brings the camera e times closer. */
const CAMERA_ZOOM_SCROLL_PX = 420;
/* How far from the table's middle a close look may centre, so it never drifts off the board. */
const CAMERA_ZOOM_TARGET_RADIUS = 5.6;

function wheelPixels(deltaY: number, deltaMode: number): number {
  const pixels = deltaY * (deltaMode === 1 ? WHEEL_LINE_PX : deltaMode === 2 ? WHEEL_PAGE_PX : 1);
  return Number.isFinite(pixels) ? pixels : 0;
}

/** The tilt a close look adds to the player's own: none at the view's distance, turning toward top-down as the camera closes in. */
export function cameraTiltForZoom(tilt: number, zoom: CameraZoom): number {
  const closeness = (1 - zoom.scale) / (1 - CAMERA_ZOOM_MINIMUM_SCALE);
  return clampCameraTilt(tilt + CAMERA_ZOOM_FULL_TILT * Math.max(0, Math.min(1, closeness)));
}

/** The pose seen through a zoom. */
export function zoomedCameraPose(pose: CameraPose, zoom: CameraZoom): CameraPose {
  const apply = (point: Vector3Tuple): Vector3Tuple => [
    point[0] * zoom.scale + zoom.offset[0],
    point[1] * zoom.scale + zoom.offset[1],
    point[2] * zoom.scale + zoom.offset[2],
  ];
  return { position: apply(pose.position), target: apply(pose.target) };
}

/*
 * The zoom after a wheel turn over `anchor`, the table point under the pointer.
 * Zooming in scales the current pose about the anchor, so what is under the pointer stays there.
 * Zooming out eases the offset away with the scale, so the camera always arrives back at today's view.
 */
function cameraZoomAfterWheel(
  zoom: CameraZoom,
  basePose: CameraPose,
  anchor: Vector3Tuple,
  deltaY: number,
  deltaMode = 0
): CameraZoom {
  const step = Math.exp(-wheelPixels(deltaY, deltaMode) / CAMERA_ZOOM_SCROLL_PX);
  const scale = Math.max(CAMERA_ZOOM_MINIMUM_SCALE, Math.min(1, zoom.scale * step));
  if (scale >= 1) {
    return NO_CAMERA_ZOOM;
  }
  let offset: Vector3Tuple;
  if (scale <= zoom.scale) {
    const applied = scale / zoom.scale;
    offset = [
      zoom.offset[0] * applied + anchor[0] * (1 - applied),
      zoom.offset[1] * applied + anchor[1] * (1 - applied),
      zoom.offset[2] * applied + anchor[2] * (1 - applied),
    ];
  } else {
    const remaining = (1 - scale) / (1 - zoom.scale);
    offset = [zoom.offset[0] * remaining, zoom.offset[1] * remaining, zoom.offset[2] * remaining];
  }
  return keepZoomOverBoard(basePose, { scale, offset });
}

/** A close look kept over the board: a target that would leave it slides back toward the middle. */
function keepZoomOverBoard(basePose: CameraPose, zoom: CameraZoom): CameraZoom {
  const target = zoomedCameraPose(basePose, zoom).target;
  const distance = Math.hypot(target[0], target[2]);
  if (distance <= CAMERA_ZOOM_TARGET_RADIUS) {
    return zoom;
  }
  const excess = 1 - CAMERA_ZOOM_TARGET_RADIUS / distance;
  return {
    scale: zoom.scale,
    offset: [zoom.offset[0] - target[0] * excess, zoom.offset[1], zoom.offset[2] - target[2] * excess],
  };
}

/*
 * The zoom after a wheel turn at a spot on the canvas, given in normalised device coordinates.
 * `poseAt` is the view's pose at a tilt. The camera turns as it closes in, so after scaling about the point under the pointer
 * the look is slid until that point is under the pointer again.
 */
export function cameraZoomAfterWheelAt(
  zoom: CameraZoom,
  tilt: number,
  poseAt: (tilt: number) => CameraPose,
  spot: Readonly<{ ndcX: number; ndcY: number; aspectRatio: number; height: number }>,
  deltaY: number,
  deltaMode = 0
): CameraZoom {
  const pointAt = (look: CameraZoom) =>
    tablePointUnder(
      zoomedCameraPose(poseAt(cameraTiltForZoom(tilt, look)), look),
      spot.aspectRatio,
      spot.ndcX,
      spot.ndcY,
      spot.height
    );
  const before = poseAt(cameraTiltForZoom(tilt, zoom));
  const anchor = pointAt(zoom) ?? zoomedCameraPose(before, zoom).target;
  let next = cameraZoomAfterWheel(zoom, before, anchor, deltaY, deltaMode);
  if (next.scale >= zoom.scale) {
    return next;
  }
  for (let pass = 0; pass < 3; pass++) {
    const landed = pointAt(next);
    if (!landed) {
      break;
    }
    next = keepZoomOverBoard(poseAt(cameraTiltForZoom(tilt, next)), {
      scale: next.scale,
      offset: [next.offset[0] + anchor[0] - landed[0], next.offset[1], next.offset[2] + anchor[2] - landed[2]],
    });
  }
  return next;
}

/** A close look's slide under the pan keys: its velocity on the table, in table units per second, and how long a key has been held. */
export type CameraPanMotion = Readonly<{ velocity: readonly [number, number]; heldSeconds: number }>;

export const CAMERA_PAN_AT_REST: CameraPanMotion = { velocity: [0, 0], heldSeconds: 0 };

/*
 * The slide after `seconds` with the pan keys pointing `direction` (x to the right, z toward the viewer; zero when none is held).
 * Holding builds speed toward a top speed, letting go coasts to a stop, and both ease, so the look moves with a little momentum.
 */
export function cameraPanMotionAfter(
  motion: CameraPanMotion,
  zoom: CameraZoom,
  direction: readonly [number, number],
  seconds: number
): CameraPanMotion {
  const step = Math.min(Math.max(seconds, 0), 0.1);
  const length = Math.hypot(direction[0], direction[1]);
  const heldSeconds = length > 0 ? motion.heldSeconds + step : 0;
  const ramp = Math.min(1, heldSeconds / CAMERA_PAN_RAMP_S);
  const speed =
    length > 0
      ? zoom.scale * (CAMERA_PAN_START_SPEED + (CAMERA_PAN_TOP_SPEED - CAMERA_PAN_START_SPEED) * ramp * ramp)
      : 0;
  const wanted: [number, number] =
    length > 0 ? [(direction[0] / length) * speed, (direction[1] / length) * speed] : [0, 0];
  const share = 1 - Math.exp(-step / CAMERA_PAN_EASE_S);
  const velocity: [number, number] = [
    motion.velocity[0] + (wanted[0] - motion.velocity[0]) * share,
    motion.velocity[1] + (wanted[1] - motion.velocity[1]) * share,
  ];
  if (length === 0 && Math.hypot(velocity[0], velocity[1]) < 0.001 * zoom.scale) {
    return CAMERA_PAN_AT_REST;
  }
  return { velocity, heldSeconds };
}

/** A close look slid by its pan velocity for `seconds`; heading out past the edge it slows, so it settles there instead of hitting it. */
export function cameraZoomAfterPanMotion(
  zoom: CameraZoom,
  basePose: CameraPose,
  velocity: readonly [number, number],
  seconds: number
): CameraZoom {
  if (zoom.scale >= 1) {
    return zoom;
  }
  const step = Math.min(Math.max(seconds, 0), 0.1);
  let [moveX, moveZ] = [velocity[0] * step, velocity[1] * step];
  const target = zoomedCameraPose(basePose, zoom).target;
  const distance = Math.hypot(target[0], target[2]);
  if (distance > 0) {
    const outwardX = target[0] / distance;
    const outwardZ = target[2] / distance;
    const outward = moveX * outwardX + moveZ * outwardZ;
    if (outward > 0) {
      const room = Math.max(0, Math.min(1, (CAMERA_ZOOM_TARGET_RADIUS - distance) / CAMERA_PAN_EDGE_MARGIN));
      const slowed = outward * room;
      moveX -= outwardX * (outward - slowed);
      moveZ -= outwardZ * (outward - slowed);
    }
  }
  return keepZoomOverBoard(basePose, {
    scale: zoom.scale,
    offset: [zoom.offset[0] + moveX, zoom.offset[1], zoom.offset[2] + moveZ],
  });
}

/** The table point under a spot on the canvas, given in normalised device coordinates, on the plane at `height`. */
export function tablePointUnder(
  pose: CameraPose,
  aspectRatio: number,
  ndcX: number,
  ndcY: number,
  height: number
): Vector3Tuple | null {
  const camera = tableCamera(pose, aspectRatio);
  const direction = new Vector3(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
  if (Math.abs(direction.y) < 1e-6) {
    return null;
  }
  const distance = (height - camera.position.y) / direction.y;
  if (distance <= 0) {
    return null;
  }
  const point = camera.position.clone().addScaledVector(direction, distance);
  return [point.x, point.y, point.z];
}

/** The table camera at a pose, with its matrices current for projecting and raycasting. */
export function tableCamera(pose: CameraPose, aspectRatio: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(TABLE_CAMERA_FIELD_OF_VIEW, aspectRatio, TABLE_CAMERA_NEAR, TABLE_CAMERA_FAR);
  camera.position.set(...pose.position);
  camera.lookAt(...pose.target);
  camera.updateMatrixWorld();
  return camera;
}

export function cameraViewTransitionProgress(elapsedMs: number): number {
  const progress = Math.max(0, Math.min(1, elapsedMs / CAMERA_VIEW_TRANSITION_MS));

  // Cubic Bezier (0, 0), (1/3, 0), (2/3, 1), (1, 1).
  return progress * progress * (3 - 2 * progress);
}

export function cameraFogRange(position: Vector3Tuple): CameraFogRange {
  const heightAboveTable = Math.abs(position[1] - 0.1);
  const scale = Math.max(1, heightAboveTable / CAMERA_FOG_REFERENCE_HEIGHT);
  return {
    near: CAMERA_FOG_NEAR * scale,
    far: CAMERA_FOG_FAR * scale,
  };
}

/** The view state for a table opened during `phase`: the camera starts on the map, and the first move waits for the next phase. */
export function createTableViewState(phase: TablePhaseId | null = null): TableViewState {
  return {
    activeView: 'map',
    cameraRevision: 0,
    interactionActive: false,
    sceneReady: false,
    pendingView: null,
    phase,
  };
}

function requestView(state: TableViewState, pendingView: PendingView): TableViewState {
  if (state.interactionActive) {
    return { ...state, pendingView };
  }
  return {
    ...state,
    activeView: pendingView.view,
    cameraRevision: state.cameraRevision + 1,
    pendingView: null,
  };
}

function changePhase(state: TableViewState, phase: TablePhaseId | null): TableViewState {
  if (phase === state.phase) {
    return state;
  }
  if (phase === null) {
    /* A phase view still waiting on an interaction is obsolete once no phase is active; a player's choice still applies. */
    return { ...state, phase, pendingView: state.pendingView?.source === 'phase' ? null : state.pendingView };
  }
  return requestView({ ...state, phase }, { view: PHASE_VIEWS[phase], source: 'phase' });
}

function changeInteraction(state: TableViewState, active: boolean): TableViewState {
  if (active === state.interactionActive) {
    return state;
  }
  if (active) {
    return { ...state, interactionActive: true };
  }
  const idleState = { ...state, interactionActive: false };
  return state.pendingView === null ? idleState : requestView(idleState, state.pendingView);
}

export function reduceTableView(state: TableViewState, event: TableViewEvent): TableViewState {
  switch (event.type) {
    case 'view.selected':
      return requestView(state, { view: event.view, source: 'player' });
    case 'phase.changed':
      return changePhase(state, event.phase);
    case 'interaction.changed':
      return changeInteraction(state, event.active);
    case 'scene.ready':
      return state.sceneReady ? state : { ...state, sceneReady: true };
  }
}
