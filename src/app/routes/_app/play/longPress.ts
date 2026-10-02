/* How long a finger rests on a piece before it asks for the piece's menu, about the platform's own long-press delay. */
export const LONG_PRESS_MS = 500;
/* A finger drifts while it rests; past this it is moving, not holding. */
const LONG_PRESS_SLOP_PX = 8;

/* The deck menu's shuffle shortcut needs a keyboard and a hovering pointer, so a menu a finger opened leaves the hint out. */
export function deckShuffleHint(openedByTouch: boolean): string | null {
  return openedByTouch ? null : 'Hover a deck and press R to shuffle.';
}

type Press = Pick<PointerEvent, 'pointerId' | 'clientX' | 'clientY'>;

/**
 * Calls `onHold` once the press has rested in place for `LONG_PRESS_MS`, the touch stand-in for a right-click.
 * The press lets go of the hold when its pointer lifts, is cancelled or moves past the slop;
 * the returned function lets go too.
 */
export function watchLongPress(
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  press: Press,
  onHold: () => void
): () => void {
  const stop = () => {
    clearTimeout(timer);
    events.removeEventListener('pointermove', move);
    events.removeEventListener('pointerup', end);
    events.removeEventListener('pointercancel', end);
  };
  const move = (event: PointerEvent) => {
    if (
      event.pointerId === press.pointerId &&
      Math.hypot(event.clientX - press.clientX, event.clientY - press.clientY) > LONG_PRESS_SLOP_PX
    ) {
      stop();
    }
  };
  const end = (event: PointerEvent) => {
    if (event.pointerId === press.pointerId) {
      stop();
    }
  };
  const timer = setTimeout(() => {
    stop();
    onHold();
  }, LONG_PRESS_MS);
  events.addEventListener('pointermove', move);
  events.addEventListener('pointerup', end);
  events.addEventListener('pointercancel', end);
  return stop;
}

/**
 * Keeps the lift of a press that opened a menu from closing it again.
 * The lift's compatibility mousedown and click would land outside the menu, so the `touchend` of that finger has its default prevented.
 * Only the finger near the press counts, a cancelled touch lets go without preventing anything, and the returned function lets go too.
 */
export function swallowLift(
  events: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  press: Pick<PointerEvent, 'clientX' | 'clientY'>
): () => void {
  const stop = () => {
    events.removeEventListener('touchend', end, true);
    events.removeEventListener('touchcancel', stop, true);
  };
  const end = (event: Event) => {
    const lifted = Array.from((event as TouchEvent).changedTouches ?? []);
    if (
      lifted.some(
        (touch) => Math.hypot(touch.clientX - press.clientX, touch.clientY - press.clientY) <= LONG_PRESS_SLOP_PX
      )
    ) {
      event.preventDefault();
      stop();
    }
  };
  events.addEventListener('touchend', end, { capture: true, passive: false });
  events.addEventListener('touchcancel', stop, true);
  return stop;
}
