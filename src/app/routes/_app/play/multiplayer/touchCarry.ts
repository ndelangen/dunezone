import type { Parcel, ParcelTrack, PointerSession } from '../PointerSession';

type Press = Pick<PointerEvent, 'pointerId' | 'pointerType' | 'button' | 'clientX' | 'clientY' | 'timeStamp'>;

/* A copy of the pressed control follows the finger, since a touch carry has no browser drag image and no scene draft. */
function ghost(source: HTMLElement, x: number, y: number): ParcelTrack {
  const copy = source.cloneNode(true) as HTMLElement;
  copy.removeAttribute('id');
  copy.setAttribute('aria-hidden', 'true');
  copy.dataset.touchCarryGhost = '';
  const { width, height } = source.getBoundingClientRect();
  Object.assign(copy.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: `${width}px`,
    height: `${height}px`,
    margin: '0',
    pointerEvents: 'none',
    opacity: '0.85',
    zIndex: '1000',
  });
  const place = (px: number, py: number) => {
    copy.style.transform = `translate(${px - width / 2}px, ${py - height / 2}px)`;
  };
  place(x, y);
  source.ownerDocument.body.append(copy);
  return { move: place, end: () => copy.remove() };
}

/** A finger's primary contact; mouse and pen presses keep the HTML5 drag. */
const isFingerPress = (press: Press) => press.pointerType === 'touch' && press.button === 0;

/**
 * Starts a touch carry of a panel parcel onto the table;
 * mouse and pen keep the control's HTML5 drag.
 * Returns whether the press was taken, so the caller can stop the browser treating it as a scroll or click.
 */
export function startTouchCarry(session: PointerSession, press: Press, source: HTMLElement, parcel: Parcel) {
  if (!isFingerPress(press) || session.busy) {
    return false;
  }
  const track = ghost(source, press.clientX, press.clientY);
  if (!session.deliver(press, parcel, track)) {
    track.end();
    return false;
  }
  return true;
}
