import type { Vector3Tuple } from '@shared/play/model';
import type { TablePhaseId } from '@shared/play/phases';
import { PerspectiveCamera } from 'three';

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
 */
function tiltedMapTarget(
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  topLimit: number,
  basis: CameraBasis,
  tilt: number
): Vector3Tuple {
  const approved = TABLE_VIEW_TARGETS.map;
  if (tilt <= 0) {
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
  return [approved[0], approved[1], approved[2] + (balanced - approved[2]) * tilt];
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
