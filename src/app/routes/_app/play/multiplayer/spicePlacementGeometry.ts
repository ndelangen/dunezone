import type { Vector3Tuple } from '@shared/play/model';
import { createSpiceStack } from '@shared/play/spiceBank';
import { clampPositionToTable } from '@shared/play/tablePhysics';
import type { Camera } from 'three';
import { Vector3 } from 'three';

import { tableDropPosition } from './tableDropPosition';

const footprint = createSpiceStack(0, 1);
const SAMPLES = [0.5, 0.25, 0.75, 0.1, 0.9];

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
      const projected = new Vector3(...position).project(camera);
      const screenX = ((projected.x + 1) * bounds.width) / 2;
      const screenY = ((1 - projected.y) * bounds.height) / 2;
      if (
        projected.z >= -1 &&
        projected.z <= 1 &&
        screenX >= 32 &&
        screenX <= bounds.width - 32 &&
        screenY >= 32 &&
        screenY <= bounds.height - 32
      ) {
        return position;
      }
    }
  }
  return null;
}
