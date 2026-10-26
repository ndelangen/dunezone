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

/* Escaping a call that throws for a pointer the browser no longer tracks; the carry goes on regardless. */
function tryPointer(action: () => void) {
  try {
    action();
  } catch {
    /* Untracked pointer. */
  }
}

/**
 * Follows one pointer from the canvas until it lifts (`finish` with the release) or the carry is called off by Escape, a cancelled or lost pointer or a window losing focus (`finish` with null).
 * Returns the call-off.
 */
function followPointer(
  canvas: HTMLCanvasElement,
  pointerId: number,
  on: { move(point: ScreenPoint): void; finish(lifted: PointerEvent | null): void }
) {
  tryPointer(() => canvas.setPointerCapture(pointerId));
  canvas.style.cursor = 'grabbing';
  const ours = (event: PointerEvent) => event.pointerId === pointerId;
  const move = (moved: PointerEvent) => ours(moved) && on.move({ clientX: moved.clientX, clientY: moved.clientY });
  const end = (lifted: PointerEvent | null) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', lost);
    window.removeEventListener('keydown', escape);
    window.removeEventListener('blur', drop);
    window.removeEventListener('pointerdown', another, true);
    canvas.removeEventListener('lostpointercapture', lost);
    tryPointer(() => canvas.releasePointerCapture(pointerId));
    canvas.style.cursor = '';
    on.finish(lifted);
  };
  const drop = () => end(null);
  const up = (lifted: PointerEvent) => ours(lifted) && end(lifted);
  const lost = (lifted: PointerEvent) => ours(lifted) && drop();
  const escape = (pressed: KeyboardEvent) => pressed.key === 'Escape' && drop();
  /* Another pointer pressing calls the carry off. */
  const another = (pressed: PointerEvent) => !ours(pressed) && drop();
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', lost);
  window.addEventListener('keydown', escape);
  window.addEventListener('blur', drop);
  window.addEventListener('pointerdown', another, true);
  canvas.addEventListener('lostpointercapture', lost);
  return drop;
}

/* Where a release drops the beacon: the board point under it, or nothing over the panels or past the board's edge, where the game places no battle. */
function dropPoint(lifted: PointerEvent | null, canvas: HTMLCanvasElement, camera: Camera) {
  const point = lifted && overTable(lifted, canvas) ? boardPoint(lifted, canvas, camera) : null;
  return point && Math.hypot(point[0], point[2]) <= BOARD_RADIUS ? point : null;
}

type Options = {
  canvas: HTMLCanvasElement;
  camera: Camera;
  invalidate: () => void;
  /** Called with the board point the beacon was dropped on; a drop off the board or a cancel calls nothing. */
  onDrop: (point: Vector3Tuple) => void;
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
    screen.current = { clientX: event.clientX, clientY: event.clientY };
    setCarrying(true);
    cancelCarry.current = followPointer(canvas, event.pointerId, {
      move(point) {
        screen.current = point;
        invalidate();
      },
      finish(lifted) {
        cancelCarry.current = null;
        screen.current = null;
        setCarrying(false);
        const point = dropPoint(lifted, canvas, camera);
        if (point) {
          onDrop(point);
        }
      },
    });
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
