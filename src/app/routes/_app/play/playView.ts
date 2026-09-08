import type { Vector3Tuple } from './model';
import { mapViewFramingPoints } from './tablePlateGeometry';

export const TABLE_VIEW_OPTIONS = [
  { id: 'map', label: 'Map' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
  { id: 'bottom', label: 'Bottom' },
] as const;

export type TableView = (typeof TABLE_VIEW_OPTIONS)[number]['id'];

export type PhaseViewRequest = Readonly<{
  id: string;
  view: TableView;
}>;

export type CameraViewCommand = Readonly<{
  view: TableView;
  revision: number;
}>;

export type TableViewState = Readonly<{
  activeView: TableView;
  cameraRevision: number;
  interactionActive: boolean;
  pendingView: TableView | null;
  pendingPhaseRequestId: string | null;
  handledPhaseRequestId: string | null;
}>;

export type TableViewEvent =
  | Readonly<{ type: 'view.selected'; view: TableView }>
  | Readonly<{ type: 'view.reset' }>
  | Readonly<{ type: 'phase.requested'; request: PhaseViewRequest }>
  | Readonly<{ type: 'phase.cleared' }>
  | Readonly<{ type: 'interaction.changed'; active: boolean }>;

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
export const MAP_VIEW_HORIZONTAL_LIMIT = 0.92;
export const MAP_VIEW_TOP_LIMIT = 0.68;
export const MAP_VIEW_BOTTOM_LIMIT = 0.9;
export const MAP_VIEW_MINIMUM_CAMERA_SCALE = 0.8;
const MAP_VIEW_HEADER_PADDING_PX = 12;
const MAP_VIEW_MINIMUM_TOP_LIMIT = 0.08;

const CAMERA_OFFSET: Vector3Tuple = [0, 9.4, 11.2];
const CAMERA_OFFSET_LENGTH = Math.hypot(...CAMERA_OFFSET);
const CAMERA_FORWARD: Vector3Tuple = [
  -CAMERA_OFFSET[0] / CAMERA_OFFSET_LENGTH,
  -CAMERA_OFFSET[1] / CAMERA_OFFSET_LENGTH,
  -CAMERA_OFFSET[2] / CAMERA_OFFSET_LENGTH,
];
const CAMERA_UP: Vector3Tuple = [0, CAMERA_OFFSET[2] / CAMERA_OFFSET_LENGTH, -CAMERA_OFFSET[1] / CAMERA_OFFSET_LENGTH];
const CAMERA_TANGENT = Math.tan((TABLE_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
const DEFAULT_MAP_VIEW_FRAMING_POINTS = mapViewFramingPoints([]);
const CAMERA_FOG_REFERENCE_HEIGHT = CAMERA_OFFSET[1];
const CAMERA_FOG_NEAR = 10;
const CAMERA_FOG_FAR = 22;
const FOCUS_VIEW_CAMERA_SCALE = 0.68;
const BOTTOM_VIEW_MINIMUM_HORIZONTAL_SCALE = 0.58;
const SIDE_VIEW_TARGET_X = 4.47;
const SIDE_VIEW_WIDE_ASPECT = 1;
const SIDE_VIEW_ASPECT_COMPENSATION = 2.85;
const SIDE_VIEW_MAX_TARGET_X = 6.1;
const MAP_VIEW_TARGET_Z = 0.8;

const TABLE_VIEW_TARGETS: Record<TableView, Vector3Tuple> = {
  map: [0, 0.1, MAP_VIEW_TARGET_Z],
  left: [-SIDE_VIEW_TARGET_X, 0.1, 0],
  right: [SIDE_VIEW_TARGET_X, 0.1, 0],
  bottom: [0, 0.1, 4.4],
};

function dot(left: Vector3Tuple, right: Vector3Tuple): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function mapCameraScaleFor(aspectRatio: number, framingPoints: readonly Vector3Tuple[], topLimit: number): number {
  const target = TABLE_VIEW_TARGETS.map;
  return framingPoints.reduce((requiredScale, point) => {
    const relativePoint: Vector3Tuple = [point[0] - target[0], point[1] - target[1], point[2] - target[2]];
    const depthAtTarget = dot(relativePoint, CAMERA_FORWARD);
    const viewHeight = dot(relativePoint, CAMERA_UP);
    const horizontalDepth = Math.abs(relativePoint[0]) / (CAMERA_TANGENT * MAP_VIEW_HORIZONTAL_LIMIT * aspectRatio);
    const verticalDepth =
      viewHeight >= 0
        ? viewHeight / (CAMERA_TANGENT * topLimit)
        : -viewHeight / (CAMERA_TANGENT * MAP_VIEW_BOTTOM_LIMIT);
    const pointScale = (Math.max(horizontalDepth, verticalDepth) - depthAtTarget) / CAMERA_OFFSET_LENGTH;
    return Math.max(requiredScale, pointScale);
  }, MAP_VIEW_MINIMUM_CAMERA_SCALE);
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
  mapTopLimit = MAP_VIEW_TOP_LIMIT
): CameraPose {
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
        : [...baseTarget];
  const cameraScale =
    view === 'map'
      ? mapCameraScaleFor(safeAspectRatio, mapFramingPoints, safeMapTopLimit)
      : view === 'bottom'
        ? Math.max(FOCUS_VIEW_CAMERA_SCALE, BOTTOM_VIEW_MINIMUM_HORIZONTAL_SCALE / safeAspectRatio)
        : FOCUS_VIEW_CAMERA_SCALE;
  return {
    target: [...target],
    position: [
      target[0] + CAMERA_OFFSET[0] * cameraScale,
      target[1] + CAMERA_OFFSET[1] * cameraScale,
      target[2] + CAMERA_OFFSET[2] * cameraScale,
    ],
  };
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

export function createTableViewState(phaseRequest: PhaseViewRequest | null = null): TableViewState {
  return {
    activeView: phaseRequest?.view ?? 'map',
    cameraRevision: 0,
    interactionActive: false,
    pendingView: null,
    pendingPhaseRequestId: null,
    handledPhaseRequestId: phaseRequest?.id ?? null,
  };
}

function requestView(state: TableViewState, view: TableView, phaseRequestId: string | null = null): TableViewState {
  if (state.interactionActive) {
    return {
      ...state,
      pendingView: view,
      pendingPhaseRequestId: phaseRequestId,
    };
  }
  return {
    ...state,
    activeView: view,
    cameraRevision: state.cameraRevision + 1,
    pendingView: null,
    pendingPhaseRequestId: null,
  };
}

function clearPhaseRequest(state: TableViewState): TableViewState {
  if (state.pendingPhaseRequestId === null && state.handledPhaseRequestId === null) {
    return state;
  }
  return {
    ...state,
    pendingView: state.pendingPhaseRequestId === null ? state.pendingView : null,
    pendingPhaseRequestId: null,
    handledPhaseRequestId: null,
  };
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
  if (event.type === 'view.selected') {
    return requestView(state, event.view);
  }
  if (event.type === 'view.reset') {
    return requestView(state, state.activeView);
  }
  if (event.type === 'phase.requested') {
    if (event.request.id === state.handledPhaseRequestId) {
      return state;
    }
    return requestView({ ...state, handledPhaseRequestId: event.request.id }, event.request.view, event.request.id);
  }
  if (event.type === 'phase.cleared') {
    return clearPhaseRequest(state);
  }
  return changeInteraction(state, event.active);
}
