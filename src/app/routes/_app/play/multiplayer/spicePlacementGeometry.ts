import type { Vector3Tuple } from '@shared/play/model';
import { createSpiceStack } from '@shared/play/spiceBank';
import { clampPositionToTable } from '@shared/play/tablePhysics';
import type { Camera } from 'three';
import { Vector3 } from 'three';

import { tableDropPosition } from './tableDropPosition';

const footprint = createSpiceStack(0, 1);
const SAMPLES = [0.5, 0.25, 0.75, 0.1, 0.9];
type Viewport = Pick<DOMRect, 'width' | 'height'>;
type Area = Readonly<{ left: number; top: number; width: number; height: number }>;
export type SpicePreviewSize = Readonly<{ width: number; height: number }>;

function within(value: number, minimum: number, maximum: number): boolean {
  return value >= minimum && value <= maximum;
}

function fitsViewport(area: Area, bounds: Viewport): boolean {
  return within(area.left, 0, bounds.width - area.width) && within(area.top, 0, bounds.height - area.height);
}

function overlapsAxis(start: number, length: number, otherStart: number, otherLength: number): boolean {
  return start < otherStart + otherLength && start + length > otherStart;
}

function overlaps(area: Area, other: Area): boolean {
  return (
    overlapsAxis(area.left, area.width, other.left, other.width) &&
    overlapsAxis(area.top, area.height, other.top, other.height)
  );
}

/* Match tablePointerPoint's occlusion rules, using full rectangles instead of one pointer position. */
function tableObstacles(canvas: HTMLCanvasElement, bounds: DOMRect): Area[] {
  return Array.from(canvas.ownerDocument.querySelectorAll<HTMLElement>('[data-private-hand], [data-hides-cursor]'))
    .filter((element) => !element.hidden && element.getClientRects().length > 0)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - bounds.left, top: rect.top - bounds.top, width: rect.width, height: rect.height };
    });
}

function projectPosition(position: Vector3Tuple, camera: Camera, bounds: Viewport) {
  const projected = new Vector3(...position).project(camera);
  return {
    x: ((projected.x + 1) * bounds.width) / 2,
    y: ((1 - projected.y) * bounds.height) / 2,
    depth: projected.z,
  };
}

function areaIsClear(area: Area, bounds: Viewport, obstacles: Area[]): boolean {
  return fitsViewport(area, bounds) && !obstacles.some((obstacle) => overlaps(area, obstacle));
}

/** The compact token and its help control stay within the viewport and clear of panels. */
export function spicePreviewIsClear(
  canvas: HTMLCanvasElement,
  camera: Camera,
  position: Vector3Tuple,
  size: SpicePreviewSize
): boolean {
  const bounds = canvas.getBoundingClientRect();
  const point = projectPosition(position, camera, bounds);
  if (!within(point.depth, -1, 1)) {
    return false;
  }
  const area = { left: point.x - size.width / 2, top: point.y - size.height / 2, ...size };
  return areaIsClear(area, bounds, tableObstacles(canvas, bounds));
}

/** Starts where this camera can see the table, including when its center points beyond an edge. */
export function visibleSpicePosition(
  canvas: HTMLCanvasElement,
  camera: Camera,
  size: SpicePreviewSize
): Vector3Tuple | null {
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
      if (spicePreviewIsClear(canvas, camera, position, size)) {
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
  offset: readonly [number, number],
  size: SpicePreviewSize
): Vector3Tuple | null {
  const bounds = canvas.getBoundingClientRect();
  const before = projectPosition(from, camera, bounds);
  const next = { x: before.x + offset[0], y: before.y + offset[1] };
  const position = tableDropPosition({ clientX: bounds.left + next.x, clientY: bounds.top + next.y }, canvas, camera);
  if (!position) {
    return null;
  }
  const supported = clampPositionToTable(footprint, position);
  if (Math.hypot(supported[0] - position[0], supported[2] - position[2]) > 1e-6) {
    return null;
  }
  return spicePreviewIsClear(canvas, camera, position, size) ? position : null;
}
