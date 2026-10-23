import type { Vector3Tuple } from '@shared/play/model';
import type { TablePhaseId } from '@shared/play/phases';
import { BOTTOM_SHELF_POSITION, BOTTOM_SHELF_SIZE, FURNITURE_SURFACE_Y } from '@shared/play/tableFurnitureLayout';
import { PerspectiveCamera, Vector3 } from 'three';

import { mapViewFramingPoints } from './tablePlateGeometry';
import { wheelPixels } from './wheelPixels';

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

type TableViewState = Readonly<{
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

type TableViewEvent =
  | Readonly<{ type: 'view.selected'; view: TableView }>
  | Readonly<{ type: 'phase.changed'; phase: TablePhaseId | null }>
  | Readonly<{ type: 'interaction.changed'; active: boolean }>
  | Readonly<{ type: 'scene.ready' }>;

export type CameraPose = Readonly<{
  position: Vector3Tuple;
  target: Vector3Tuple;
}>;

/** A rectangle on the canvas in normalised device coordinates (x to the right, y up, -1 to 1 edge to edge), such as a chip floating over the table. */
export type ScreenRect = Readonly<{ left: number; right: number; bottom: number; top: number }>;

type CameraFogRange = Readonly<{
  near: number;
  far: number;
}>;

export const CAMERA_VIEW_TRANSITION_MS = 300;
export const TABLE_CAMERA_FIELD_OF_VIEW = 42;
export const TABLE_CAMERA_NEAR = 0.1;
export const TABLE_CAMERA_FAR = 100;
export const MAP_VIEW_HORIZONTAL_LIMIT = 0.92;
/* The header has no bar of its own: the map view runs as close to the canvas's top as to its bottom, and frames around the chips floating over it instead. */
export const MAP_VIEW_TOP_LIMIT = 0.9;
export const MAP_VIEW_BOTTOM_LIMIT = 0.9;
/* The closest the map view comes, so a canvas with room to spare keeps the side card wells in frame instead of filling up with the board alone. */
export const MAP_VIEW_MINIMUM_CAMERA_SCALE = 0.65;

const CAMERA_OFFSET: Vector3Tuple = [0, 9.4, 11.2];
const CAMERA_OFFSET_LENGTH = Math.hypot(...CAMERA_OFFSET);
/* The approved table angle, measured from straight down, and the steepest the player may tilt to: near top-down, short of the pole where the orbit loses its heading. */
const CAMERA_APPROVED_POLAR_ANGLE = Math.atan2(CAMERA_OFFSET[2], CAMERA_OFFSET[1]);
export const CAMERA_TOP_DOWN_POLAR_ANGLE = 0.2;
/* Scroll distance, in pixels, that tilts the camera from the approved angle all the way to top-down. */
const CAMERA_TILT_SCROLL_RANGE_PX = 600;
const CAMERA_TANGENT = Math.tan((TABLE_CAMERA_FIELD_OF_VIEW * Math.PI) / 360);
const DEFAULT_MAP_VIEW_FRAMING_POINTS = mapViewFramingPoints([]);
const CAMERA_FOG_REFERENCE_HEIGHT = CAMERA_OFFSET[1];
const CAMERA_FOG_NEAR = 10;
const CAMERA_FOG_FAR = 22;
const FOCUS_VIEW_CAMERA_SCALE = 0.68;
const BOTTOM_VIEW_CAMERA_SCALE = 0.74;
const SIDE_VIEW_TARGET_X = 4.47;
const SIDE_VIEW_WIDE_ASPECT = 1;
const SIDE_VIEW_ASPECT_COMPENSATION = 2.85;
const SIDE_VIEW_MAX_TARGET_X = 6.1;
const MAP_VIEW_TARGET_Z = 0.8;
/* How far from the approved target the map view's centring looks, and how finely: a few millionths of a table unit. */
const MAP_VIEW_TARGET_SEARCH_RANGE = 6;
const MAP_VIEW_TARGET_SEARCH_STEPS = 22;
const NO_SCREEN_RECTS: readonly ScreenRect[] = [];

const TABLE_VIEW_TARGETS: Record<TableView, Vector3Tuple> = {
  map: [0, 0.1, MAP_VIEW_TARGET_Z],
  left: [-SIDE_VIEW_TARGET_X, 0.1, 0],
  right: [SIDE_VIEW_TARGET_X, 0.1, 0],
  bottom: [0, 0.1, BOTTOM_SHELF_POSITION[2] - 1.3],
};

const BOTTOM_VIEW_FRAMING_POINTS: readonly Vector3Tuple[] = [-1, 1].flatMap((x) =>
  [-1, 1].map((z) => [
    BOTTOM_SHELF_POSITION[0] + (x * BOTTOM_SHELF_SIZE[0]) / 2,
    FURNITURE_SURFACE_Y,
    BOTTOM_SHELF_POSITION[2] + (z * BOTTOM_SHELF_SIZE[2]) / 2,
  ])
);

/* The camera's direction from its target and its screen axes at a tilt: 0 is the approved angle, 1 is near top-down. */
type CameraBasis = Readonly<{ offset: Vector3Tuple; forward: Vector3Tuple; up: Vector3Tuple }>;

/** A tilt within its range, where 0 is the approved table angle and 1 is near top-down. */
function clampCameraTilt(tilt: number): number {
  return Number.isFinite(tilt) ? Math.max(0, Math.min(1, tilt)) : 0;
}

/** The tilt after a wheel turn: scrolling down raises the camera toward top-down, scrolling up lowers it back to the approved angle. */
export function cameraTiltAfterWheel(tilt: number, deltaY: number, deltaMode = 0): number {
  return clampCameraTilt(tilt + wheelPixels(deltaY, deltaMode) / CAMERA_TILT_SCROLL_RANGE_PX);
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

/* The least reciprocal depth at which a coordinate c, seen at c * u on screen, lies within [min, max]; Infinity when it never does. */
function reciprocalFrom(c: number, min: number, max: number): number {
  if (c === 0) {
    return min <= 0 && max >= 0 ? 0 : Number.POSITIVE_INFINITY;
  }
  return c > 0 ? min / c : max / c;
}

/* The greatest reciprocal depth at which the coordinate lies within [min, max]. */
function reciprocalTo(c: number, min: number, max: number): number {
  if (c === 0) {
    return min <= 0 && max >= 0 ? Number.POSITIVE_INFINITY : 0;
  }
  return c > 0 ? max / c : min / c;
}

/*
 * The depth past which a point, seen at (x / depth, y / depth) on screen, has left a rectangle; `depth` itself when it is not inside there.
 * As the camera backs away every point slides straight toward the middle of the screen, so a rectangle clear of the middle
 * holds the point over one stretch of depths at most, and backing away past its end frees the point for good.
 * In reciprocal depth u = 1 / depth the point sits at (x * u, y * u), so each side of the rectangle bounds u from one side.
 */
function depthLeaving(x: number, y: number, depth: number, rect: ScreenRect): number {
  const lowest = Math.max(0, reciprocalFrom(x, rect.left, rect.right), reciprocalFrom(y, rect.bottom, rect.top));
  const highest = Math.min(reciprocalTo(x, rect.left, rect.right), reciprocalTo(y, rect.bottom, rect.top));
  /* A rectangle over the middle of the screen would hold the point however far the camera backed away, so it frames nothing. */
  if (lowest <= 0 || lowest >= highest) {
    return depth;
  }
  const inside = depth >= 1 / highest && depth < 1 / lowest;
  return inside ? 1 / lowest : depth;
}

/* The nearest depth, at or past `depth`, where the point lies under none of the rectangles. */
function depthClearOf(x: number, y: number, depth: number, obstacles: readonly ScreenRect[]): number {
  let clear = depth;
  /* Leaving one rectangle can land the point in another nearer the middle, so look again until a pass moves nothing. */
  for (let pass = 0; pass <= obstacles.length; pass++) {
    const before = clear;
    for (const rect of obstacles) {
      clear = depthLeaving(x, y, clear, rect);
    }
    if (clear === before) {
      break;
    }
  }
  return clear;
}

/* The camera never turns sideways, so a point's depth and height on screen take only its height and depth on the table. */
function cameraScaleForFraming(
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  topLimit: number,
  basis: CameraBasis,
  target: Vector3Tuple = TABLE_VIEW_TARGETS.map,
  minimumScale = MAP_VIEW_MINIMUM_CAMERA_SCALE,
  obstacles: readonly ScreenRect[] = NO_SCREEN_RECTS
): number {
  const count = framingPoints.length;
  const screenX = new Float64Array(count);
  const screenY = new Float64Array(count);
  const depthsAtTarget = new Float64Array(count);
  let scale = minimumScale;
  for (let index = 0; index < count; index++) {
    const point = framingPoints[index];
    const relativeX = point[0] - target[0];
    const relativeY = point[1] - target[1];
    const relativeZ = point[2] - target[2];
    const depthAtTarget = relativeY * basis.forward[1] + relativeZ * basis.forward[2];
    const viewHeight = relativeY * basis.up[1] + relativeZ * basis.up[2];
    const horizontalDepth = Math.abs(relativeX) / (CAMERA_TANGENT * MAP_VIEW_HORIZONTAL_LIMIT * aspectRatio);
    const verticalDepth =
      viewHeight >= 0
        ? viewHeight / (CAMERA_TANGENT * topLimit)
        : -viewHeight / (CAMERA_TANGENT * MAP_VIEW_BOTTOM_LIMIT);
    screenX[index] = relativeX / (CAMERA_TANGENT * aspectRatio);
    screenY[index] = viewHeight / CAMERA_TANGENT;
    depthsAtTarget[index] = depthAtTarget;
    const depth = depthClearOf(screenX[index], screenY[index], Math.max(horizontalDepth, verticalDepth), obstacles);
    scale = Math.max(scale, (depth - depthAtTarget) / CAMERA_OFFSET_LENGTH);
  }
  /*
   * Another point may hold the camera further back than a point needs for itself, which can slide that point under a chip
   * nearer the middle, so every point is looked at again at the shared distance until none lies under a chip.
   */
  for (let pass = 0; pass <= obstacles.length; pass++) {
    let moved = false;
    for (let index = 0; index < count; index++) {
      const depth = scale * CAMERA_OFFSET_LENGTH + depthsAtTarget[index];
      const clear = depthClearOf(screenX[index], screenY[index], depth, obstacles);
      if (clear > depth) {
        scale = Math.max(scale, (clear - depthsAtTarget[index]) / CAMERA_OFFSET_LENGTH);
        moved = true;
      }
    }
    if (!moved) {
      break;
    }
  }
  return scale;
}

/* How much more room the frame leaves above it than below it, on screen, with the camera at `scale`. */
function verticalImbalance(
  framingPoints: readonly Vector3Tuple[],
  topLimit: number,
  basis: CameraBasis,
  target: Vector3Tuple,
  scale: number
): number {
  let highest = Number.NEGATIVE_INFINITY;
  let lowest = Number.POSITIVE_INFINITY;
  for (const point of framingPoints) {
    const relativeY = point[1] - target[1];
    const relativeZ = point[2] - target[2];
    const depthAtTarget = relativeY * basis.forward[1] + relativeZ * basis.forward[2];
    const viewHeight = relativeY * basis.up[1] + relativeZ * basis.up[2];
    const screenY = viewHeight / (CAMERA_TANGENT * (scale * CAMERA_OFFSET_LENGTH + depthAtTarget));
    highest = Math.max(highest, screenY);
    lowest = Math.min(lowest, screenY);
  }
  return topLimit - highest - (lowest + MAP_VIEW_BOTTOM_LIMIT);
}

/*
 * Where along the table's depth the map view looks: where the frame sits midway between the canvas's top and bottom.
 * Where the frame fills the canvas's height that is also where the camera comes closest, and where the width or the closest
 * the camera comes holds it back first, the board stays centred instead of drifting toward an edge.
 * Moving the target toward the viewer raises the frame on screen, so a bisection over the depth finds the middle.
 */
function centredMapTarget(
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  topLimit: number,
  basis: CameraBasis,
  obstacles: readonly ScreenRect[]
): Vector3Tuple {
  const approved = TABLE_VIEW_TARGETS.map;
  const targetAt = (depth: number): Vector3Tuple => [approved[0], approved[1], depth];
  const imbalanceAt = (depth: number) =>
    verticalImbalance(
      framingPoints,
      topLimit,
      basis,
      targetAt(depth),
      cameraScaleForFraming(
        aspectRatio,
        framingPoints,
        topLimit,
        basis,
        targetAt(depth),
        MAP_VIEW_MINIMUM_CAMERA_SCALE,
        obstacles
      )
    );
  let near = approved[2] - MAP_VIEW_TARGET_SEARCH_RANGE;
  let far = approved[2] + MAP_VIEW_TARGET_SEARCH_RANGE;
  for (let step = 0; step < MAP_VIEW_TARGET_SEARCH_STEPS; step++) {
    const middle = (near + far) / 2;
    if (imbalanceAt(middle) > 0) {
      near = middle;
    } else {
      far = middle;
    }
  }
  return targetAt((near + far) / 2);
}

/* Where a side or bottom view looks; a narrow canvas moves a side view further out, so its card well stays in frame. */
function fixedViewTarget(view: Exclude<TableView, 'map'>, aspectRatio: number): Vector3Tuple {
  const baseTarget = TABLE_VIEW_TARGETS[view];
  if (view === 'bottom') {
    return [...baseTarget];
  }
  const narrowViewOffset = Math.max(0, SIDE_VIEW_WIDE_ASPECT - aspectRatio) * SIDE_VIEW_ASPECT_COMPENSATION;
  const sideTargetX = Math.min(SIDE_VIEW_MAX_TARGET_X, SIDE_VIEW_TARGET_X + narrowViewOffset);
  return [view === 'left' ? -sideTargetX : sideTargetX, baseTarget[1], baseTarget[2]];
}

/*
 * The map view's centred targets already found, per frame and set of chips, by canvas shape and tilt.
 * A close look asks for its view's pose several times a frame while it zooms or pans, turning as it closes in, so the target is
 * looked for only at a few fixed tilts and blended between the two either side, which keeps a turning camera gliding rather
 * than stepping. The camera's distance, worked out for the tilt itself, still keeps the frame in view.
 */
const MAP_TARGET_TILT_STEPS = 32;
const MAP_TARGET_CACHE_SIZE = 64;
const mapTargetCache = new WeakMap<
  readonly Vector3Tuple[],
  WeakMap<readonly ScreenRect[], Map<string, Vector3Tuple>>
>();

function mapTargetsFor(framingPoints: readonly Vector3Tuple[], obstacles: readonly ScreenRect[]) {
  let byObstacles = mapTargetCache.get(framingPoints);
  if (!byObstacles) {
    byObstacles = new WeakMap();
    mapTargetCache.set(framingPoints, byObstacles);
  }
  let targets = byObstacles.get(obstacles);
  if (!targets) {
    targets = new Map();
    byObstacles.set(obstacles, targets);
  }
  return targets;
}

function steppedMapTarget(
  targets: Map<string, Vector3Tuple>,
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  step: number,
  obstacles: readonly ScreenRect[]
): Vector3Tuple {
  const key = `${aspectRatio}:${step}`;
  const cached = targets.get(key);
  if (cached) {
    return cached;
  }
  const target = centredMapTarget(
    aspectRatio,
    framingPoints,
    MAP_VIEW_TOP_LIMIT,
    cameraBasisFor(step / MAP_TARGET_TILT_STEPS),
    obstacles
  );
  if (targets.size >= MAP_TARGET_CACHE_SIZE) {
    targets.clear();
  }
  targets.set(key, target);
  return target;
}

function cachedMapTarget(
  aspectRatio: number,
  framingPoints: readonly Vector3Tuple[],
  tilt: number,
  obstacles: readonly ScreenRect[]
): Vector3Tuple {
  const targets = mapTargetsFor(framingPoints, obstacles);
  const position = tilt * MAP_TARGET_TILT_STEPS;
  const below = Math.floor(position);
  const blend = position - below;
  const low = steppedMapTarget(targets, aspectRatio, framingPoints, below, obstacles);
  if (blend < 1e-9) {
    return [...low];
  }
  const high = steppedMapTarget(targets, aspectRatio, framingPoints, below + 1, obstacles);
  return [0, 1, 2].map((axis) => low[axis] + (high[axis] - low[axis]) * blend) as Vector3Tuple;
}

/*
 * The pose for a view. `mapObstacles` are the chips floating over the canvas: the map view keeps its frame out from under them
 * and otherwise runs to the canvas's edges, so the board takes the room between them.
 */
export function cameraPoseFor(
  view: TableView,
  aspectRatio = 1,
  mapFramingPoints: readonly Vector3Tuple[] = DEFAULT_MAP_VIEW_FRAMING_POINTS,
  tilt = 0,
  mapObstacles: readonly ScreenRect[] = NO_SCREEN_RECTS
): CameraPose {
  const basis = cameraBasisFor(tilt);
  const safeAspectRatio = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const target: Vector3Tuple =
    view === 'map'
      ? cachedMapTarget(safeAspectRatio, mapFramingPoints, clampCameraTilt(tilt), mapObstacles)
      : fixedViewTarget(view, safeAspectRatio);
  const cameraScale =
    view === 'map'
      ? cameraScaleForFraming(
          safeAspectRatio,
          mapFramingPoints,
          MAP_VIEW_TOP_LIMIT,
          basis,
          target,
          MAP_VIEW_MINIMUM_CAMERA_SCALE,
          mapObstacles
        )
      : view === 'bottom'
        ? cameraScaleForFraming(
            safeAspectRatio,
            BOTTOM_VIEW_FRAMING_POINTS,
            MAP_VIEW_TOP_LIMIT,
            basis,
            target,
            BOTTOM_VIEW_CAMERA_SCALE
          )
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
/* The nearest the orbit controls let the camera come to its target: well inside the closest look of any view, so every look's pose is reached, not clamped short of it. */
export const CAMERA_CLOSEST_DISTANCE = 1;
/* How far toward top-down the closest look turns: most of the way, while every wheel notch still brings the board closer. */
const CAMERA_ZOOM_FULL_TILT = 0.85;
/*
 * How quickly the pan keys slide a close look, in table units per second at the view's own distance; closer looks slide slower.
 * A held key starts at the first speed and builds to the second over the ramp, quickly at first and gently near the top.
 * The look takes up its speed quickly and lets go of it gently, so it gets going at once and coasts to a stop (Norbert, 2026-10-12).
 */
const CAMERA_PAN_START_SPEED = 16;
const CAMERA_PAN_TOP_SPEED = 26;
const CAMERA_PAN_RAMP_S = 0.5;
const CAMERA_PAN_SPEED_UP_S = 0.05;
const CAMERA_PAN_SLOW_DOWN_S = 0.22;
/* Within this distance of the edge a close look may reach, sliding further out slows to a stop. */
const CAMERA_PAN_EDGE_MARGIN = 1.2;
/* Scroll distance, in pixels, that brings the camera e times closer. */
const CAMERA_ZOOM_SCROLL_PX = 420;
/*
 * Where a close look may centre, so it never drifts off the table: the round table, the band across it that holds the side card wells,
 * and the bottom shelf with the Tanks and shared items. Each rectangle is [minX, maxX, minZ, maxZ] on the table.
 */
const CAMERA_ZOOM_TARGET_RADIUS = 5.6;
const CAMERA_ZOOM_TARGET_RECTANGLES = [
  [-6.9, 6.9, -2, 2],
  [-BOTTOM_SHELF_SIZE[0] / 2, BOTTOM_SHELF_SIZE[0] / 2, 0, BOTTOM_SHELF_POSITION[2] + BOTTOM_SHELF_SIZE[2] / 2],
] as const;

/** How far inside the reachable area a table point lies; negative outside it. */
function zoomTargetDepth(x: number, z: number): number {
  let depth = CAMERA_ZOOM_TARGET_RADIUS - Math.hypot(x, z);
  for (const [minX, maxX, minZ, maxZ] of CAMERA_ZOOM_TARGET_RECTANGLES) {
    depth = Math.max(depth, Math.min(x - minX, maxX - x, z - minZ, maxZ - z));
  }
  return depth;
}

/** The nearest point of the reachable area. */
function nearestZoomTarget(x: number, z: number): [number, number] {
  const distance = Math.hypot(x, z);
  let best: [number, number] =
    distance <= CAMERA_ZOOM_TARGET_RADIUS
      ? [x, z]
      : [(x / distance) * CAMERA_ZOOM_TARGET_RADIUS, (z / distance) * CAMERA_ZOOM_TARGET_RADIUS];
  for (const [minX, maxX, minZ, maxZ] of CAMERA_ZOOM_TARGET_RECTANGLES) {
    const candidate: [number, number] = [Math.min(maxX, Math.max(minX, x)), Math.min(maxZ, Math.max(minZ, z))];
    if (Math.hypot(candidate[0] - x, candidate[1] - z) < Math.hypot(best[0] - x, best[1] - z)) {
      best = candidate;
    }
  }
  return best;
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
  if (zoomTargetDepth(target[0], target[2]) >= 0) {
    return zoom;
  }
  const [x, z] = nearestZoomTarget(target[0], target[2]);
  return {
    scale: zoom.scale,
    offset: [zoom.offset[0] + x - target[0], zoom.offset[1], zoom.offset[2] + z - target[2]],
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

/* How quickly a close look follows the wheel: the share of the way left after a second's glide is e^(-1/τ). */
const CAMERA_GLIDE_TIME_CONSTANT_S = 0.07;

/**
 * The share of the way left that a close look's glide covers in a frame lasting `seconds`.
 * It follows the time the frame really covers, so a device that draws few frames arrives when a fast one does, not after a fixed count of frames;
 * the decay never overshoots however long the frame, and the scheduler already measures a woken loop's first frame as one ordinary frame.
 */
export function cameraGlideShare(seconds: number): number {
  return 1 - Math.exp(-Math.max(seconds, 0) / CAMERA_GLIDE_TIME_CONSTANT_S);
}

/** A close look's slide under the pan keys: its velocity on the table, in table units per second, and how long a key has been held. */
export type CameraPanMotion = Readonly<{ velocity: readonly [number, number]; heldSeconds: number }>;

export const CAMERA_PAN_AT_REST: CameraPanMotion = { velocity: [0, 0], heldSeconds: 0 };

/*
 * The slide after `seconds` with the pan keys pointing `direction` (x to the right, z toward the viewer; zero when none is held).
 * Holding builds speed toward a top speed, letting go coasts to a stop, and both ease, so the look moves with a little momentum.
 * `speedScale` is the viewer's own pan speed, scaling every speed along the way.
 */
export function cameraPanMotionAfter(
  motion: CameraPanMotion,
  zoom: CameraZoom,
  direction: readonly [number, number],
  seconds: number,
  speedScale = 1
): CameraPanMotion {
  const step = Math.min(Math.max(seconds, 0), 0.1);
  const length = Math.hypot(direction[0], direction[1]);
  const heldSeconds = length > 0 ? motion.heldSeconds + step : 0;
  const ramp = 1 - (1 - Math.min(1, heldSeconds / CAMERA_PAN_RAMP_S)) ** 2;
  const speed =
    length > 0
      ? speedScale * zoom.scale * (CAMERA_PAN_START_SPEED + (CAMERA_PAN_TOP_SPEED - CAMERA_PAN_START_SPEED) * ramp)
      : 0;
  const wanted: [number, number] =
    length > 0 ? [(direction[0] / length) * speed, (direction[1] / length) * speed] : [0, 0];
  const share = 1 - Math.exp(-step / (length > 0 ? CAMERA_PAN_SPEED_UP_S : CAMERA_PAN_SLOW_DOWN_S));
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
  /* The way out of the reachable area here is where its depth falls fastest. */
  const depth = zoomTargetDepth(target[0], target[2]);
  const nudge = 0.01;
  const fallX = depth - zoomTargetDepth(target[0] + nudge, target[2]);
  const fallZ = depth - zoomTargetDepth(target[0], target[2] + nudge);
  const fall = Math.hypot(fallX, fallZ);
  if (fall > 0) {
    const outwardX = fallX / fall;
    const outwardZ = fallZ / fall;
    const outward = moveX * outwardX + moveZ * outwardZ;
    if (outward > 0) {
      const room = Math.max(0, Math.min(1, depth / CAMERA_PAN_EDGE_MARGIN));
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

  /* Cubic Bezier (0, 0), (1/3, 0), (2/3, 1), (1, 1). */
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
