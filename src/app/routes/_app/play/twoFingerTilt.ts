type Callbacks = {
  /** A second finger landed: whatever the first finger had started on the table stops. */
  onStart(): void;
  /** The two fingers moved together by `deltaY` pixels; up is positive, like scrolling the wheel down. */
  onTilt(deltaY: number): void;
};

/**
 * Two fingers dragged up or down over the board tilt the camera, the touch stand-in for the wheel.
 * The second finger's pointerdown stops at the board, so the table never reads it as a press on a piece.
 */
export function watchTwoFingerTilt(
  surface: Pick<HTMLElement, 'addEventListener' | 'removeEventListener'>,
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  { onStart, onTilt }: Callbacks
): () => void {
  const fingers = new Map<number, number>();
  let lastMeanY: number | null = null;
  const meanY = () => [...fingers.values()].reduce((sum, y) => sum + y, 0) / fingers.size;

  const down = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') {
      return;
    }
    fingers.set(event.pointerId, event.clientY);
    if (fingers.size === 2) {
      event.stopPropagation();
      lastMeanY = meanY();
      onStart();
    } else {
      lastMeanY = null;
    }
  };
  const move = (event: PointerEvent) => {
    if (!fingers.has(event.pointerId)) {
      return;
    }
    fingers.set(event.pointerId, event.clientY);
    if (fingers.size !== 2 || lastMeanY === null) {
      return;
    }
    const mean = meanY();
    const deltaY = lastMeanY - mean;
    lastMeanY = mean;
    if (deltaY !== 0) {
      onTilt(deltaY);
    }
  };
  const up = (event: PointerEvent) => {
    if (fingers.delete(event.pointerId)) {
      /* A stray third finger lifting leaves a pair that keeps tilting from where it is. */
      lastMeanY = fingers.size === 2 ? meanY() : null;
    }
  };

  surface.addEventListener('pointerdown', down as EventListener);
  events.addEventListener('pointermove', move);
  events.addEventListener('pointerup', up);
  events.addEventListener('pointercancel', up);
  return () => {
    surface.removeEventListener('pointerdown', down as EventListener);
    events.removeEventListener('pointermove', move);
    events.removeEventListener('pointerup', up);
    events.removeEventListener('pointercancel', up);
  };
}
