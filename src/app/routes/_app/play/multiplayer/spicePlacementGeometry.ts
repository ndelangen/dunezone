import type { Vector3Tuple } from '@shared/play/model';
import { createSpiceStack } from '@shared/play/spiceBank';
import { clampPositionToTable } from '@shared/play/tablePhysics';
import type { Camera } from 'three';
import { Vector3 } from 'three';

import { tableDropPosition } from './tableDropPosition';

const footprint = createSpiceStack(0, 1);
const SAMPLES = [0.5, 0.25, 0.75, 0.1, 0.9];
const PREVIEW_RADIUS = 32;
type Viewport = Pick<DOMRect, 'width' | 'height'>;
type ScreenPoint = Readonly<{ x: number; y: number }>;

function within(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

/* The whole preview remains on screen, rather than only its center. */
function fitsViewport(point: ScreenPoint, bounds: Viewport): boolean {
  return (
    within(point.x, PREVIEW_RADIUS, bounds.width - PREVIEW_RADIUS) &&
    within(point.y, PREVIEW_RADIUS, bounds.height - PREVIEW_RADIUS)
  );
}

function projectPosition(position: Vector3Tuple, camera: Camera, bounds: Viewport) {
  const projected = new Vector3(...position).project(camera);
  return {
    x: ((projected.x + 1) * bounds.width) / 2,
    y: ((1 - projected.y) * bounds.height) / 2,
    depth: projected.z,
  };
}

function visiblePosition(position: Vector3Tuple, camera: Camera, bounds: Viewport): boolean {
  const point = projectPosition(position, camera, bounds);
  return within(point.depth, -1, 1) && fitsViewport(point, bounds);
}

/** Starts where this camera can see the table, including when its center points beyond an edge. */
export function visibleSpicePosition(canvas: HTMLCanvasElement, camera: Camera): Vector3Tuple | null {
  const bounds = canvas.getBoundingClientRect();
  for (const x of SAMPLES) {
    for (const y of SAMPLES) {
      const hit = tableDropPosition(
        { clientX: bounds.left + bounds.width * x, clientY: bounds.top + bounds.height * y },
        canvas,
        camera
      );
      if (!hit) {
        continue;
      }
      const position = clampPositionToTable(footprint, hit);
      if (visiblePosition(position, camera, bounds)) {
        return position;
      }
    }
  }
  return null;
}

/** Moves a preview by screen pixels only when the destination fits both the viewport and the tabletop. */
export function moveSpicePosition(
  canvas: HTMLCanvasElement,
  camera: Camera,
  from: Vector3Tuple,
  offset: readonly [number, number]
): Vector3Tuple | null {
  const bounds = canvas.getBoundingClientRect();
  const before = projectPosition(from, camera, bounds);
  const next = { x: before.x + offset[0], y: before.y + offset[1] };
  if (!fitsViewport(next, bounds)) {
    return null;
  }
  const position = tableDropPosition({ clientX: bounds.left + next.x, clientY: bounds.top + next.y }, canvas, camera);
  if (!position) {
    return null;
  }
  const supported = clampPositionToTable(footprint, position);
  return Math.hypot(supported[0] - position[0], supported[2] - position[2]) <= 1e-6 ? position : null;
}
