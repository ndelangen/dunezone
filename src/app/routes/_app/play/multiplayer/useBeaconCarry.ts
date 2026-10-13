import type { Vector3Tuple } from '@shared/play/model';
import { BOARD_RADIUS, BOARD_SURFACE_Y } from '@shared/play/tableGeometry';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Camera } from 'three';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';

type ScreenPoint = { clientX: number; clientY: number };

function boardPoint(event: ScreenPoint, canvas: HTMLCanvasElement, camera: Camera): Vector3Tuple | null {
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

/* A release over the panels or header lands on them, not on the board hidden underneath. */
function overTable(event: ScreenPoint, canvas: HTMLCanvasElement) {
  const under = canvas.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  return under === canvas || Boolean(under?.closest('[data-local-carry]'));
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
 * Escape, a lost pointer or a window that loses focus puts it back, as does `putDown` or the beacon going away.
 * The carried point is read through the current camera every time, so a pan or zoom mid-carry drops where the beacon shows.
 */
export function useBeaconCarry({ canvas, camera, invalidate, onDrop }: Options) {
  const [carrying, setCarrying] = useState(false);
  const screen = useRef<ScreenPoint | null>(null);
  const cancelCarry = useRef<(() => void) | null>(null);

  const pickUp = (event: PointerEvent) => {
    event.preventDefault();
    cancelCarry.current?.();
    const pointerId = event.pointerId;
    try {
      canvas.setPointerCapture(pointerId);
    } catch {
      /* A pointer the browser no longer tracks still carries until it lifts. */
    }
    screen.current = { clientX: event.clientX, clientY: event.clientY };
    setCarrying(true);
    canvas.style.cursor = 'grabbing';
    const move = (moved: PointerEvent) => {
      if (moved.pointerId === pointerId) {
        screen.current = { clientX: moved.clientX, clientY: moved.clientY };
        invalidate();
      }
    };
    const finish = (lifted: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', drop);
      canvas.removeEventListener('lostpointercapture', lost);
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        /* Already released. */
      }
      cancelCarry.current = null;
      screen.current = null;
      canvas.style.cursor = '';
      setCarrying(false);
      const point = lifted && overTable(lifted, canvas) ? boardPoint(lifted, canvas, camera) : null;
      /* The game places battles on the board only, so a drop past its edge is no drop at all. */
      if (point && Math.hypot(point[0], point[2]) <= BOARD_RADIUS) {
        onDrop(point);
      }
    };
    const drop = () => finish(null);
    const up = (lifted: PointerEvent) => lifted.pointerId === pointerId && finish(lifted);
    const cancel = (lifted: PointerEvent) => lifted.pointerId === pointerId && drop();
    const lost = (lifted: PointerEvent) => lifted.pointerId === pointerId && drop();
    const escape = (pressed: KeyboardEvent) => pressed.key === 'Escape' && drop();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', drop);
    canvas.addEventListener('lostpointercapture', lost);
    cancelCarry.current = drop;
  };

  const putDown = useCallback(() => cancelCarry.current?.(), []);
  useEffect(() => () => cancelCarry.current?.(), []);
  /** Where the beacon is held over the board right now, through the camera as it stands. */
  const carryAt = useCallback(
    () => (screen.current ? boardPoint(screen.current, canvas, camera) : null),
    [canvas, camera]
  );
  return { carrying, carryAt, pickUp, putDown };
}
