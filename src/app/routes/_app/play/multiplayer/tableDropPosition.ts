import type { Vector3Tuple } from '@shared/play/model';
import type { Camera } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

/** Where a viewport point meets the tabletop plane, shared by pointer and keyboard placement. */
export function tableDropPosition(
  point: Readonly<{ clientX: number; clientY: number }>,
  canvas: HTMLCanvasElement,
  camera: Camera
): Vector3Tuple | null {
  const bounds = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(
    new Vector2(
      ((point.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(point.clientY - bounds.top) / bounds.height) * 2 + 1
    ),
    camera
  );
  const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -0.18), new Vector3());
  return hit && [hit.x, 0.18, hit.z];
}
