import type { Vector3Tuple } from '@shared/play/model';
import { BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { useCallback, useRef, useState } from 'react';
import type { Camera } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

/* A drop counts on the board, as the marker's drop always has. */
const BOARD_DROP_RADIUS = 5.5;

function boardPoint(event: PointerEvent, canvas: HTMLCanvasElement, camera: Camera): Vector3Tuple | null {
  const bounds = canvas.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(
    new Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(event.clientY - bounds.top) / bounds.height) * 2 + 1
    ),
    camera
  );
  const point = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -BOARD_SURFACE_Y), new Vector3());
  return point && [point.x, 0.18, point.z];
}

type Options = {
  canvas: HTMLCanvasElement;
  camera: Camera;
  invalidate(): void;
  /** Called with the board point the beacon was dropped on; a drop off the board or a cancel calls nothing. */
  onDrop(point: Vector3Tuple): void;
};

/**
 * Carrying the beacon: a press on it captures the pointer and follows it over the board until it lifts.
 * Escape or a lost pointer puts it back.
 */
export function useBeaconCarry({ canvas, camera, invalidate, onDrop }: Options) {
  const [carrying, setCarrying] = useState(false);
  const carryPoint = useRef<Vector3Tuple | null>(null);

  const pickUp = (event: PointerEvent) => {
    event.preventDefault();
    const pointerId = event.pointerId;
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      /* A pointer the browser no longer tracks still carries until it lifts. */
    }
    carryPoint.current = boardPoint(event, canvas, camera);
    setCarrying(true);
    canvas.style.cursor = 'grabbing';
    const move = (moved: PointerEvent) => {
      if (moved.pointerId !== pointerId) {
        return;
      }
      carryPoint.current = boardPoint(moved, canvas, camera) ?? carryPoint.current;
      invalidate();
    };
    const finish = (lifted: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      canvas.style.cursor = '';
      const point = lifted ? boardPoint(lifted, canvas, camera) : null;
      if (point && Math.hypot(point[0], point[2]) <= BOARD_DROP_RADIUS) {
        onDrop(point);
      }
      setCarrying(false);
    };
    const up = (lifted: PointerEvent) => lifted.pointerId === pointerId && finish(lifted);
    const cancel = (lifted: PointerEvent) => lifted.pointerId === pointerId && finish(null);
    const escape = (pressed: KeyboardEvent) => pressed.key === 'Escape' && finish(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
  };

  const putDown = useCallback(() => setCarrying(false), []);
  return { carrying, carryPoint, pickUp, putDown };
}
