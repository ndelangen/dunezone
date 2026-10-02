/* @vitest-environment jsdom */
import { initialSnapshot } from '@shared/play/commands';
import type { Vector3Tuple } from '@shared/play/model';
import { afterEach, expect, test, vi } from 'vitest';

import { LONG_PRESS_SLOP_PX } from './longPress';
import { PointerSession } from './PointerSession';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

function pointer(type: string, x = 10, pointerId = 1, timeStamp = 0, pointerType = 'mouse') {
  const event = Object.assign(new MouseEvent(type, { clientX: x, clientY: 10, button: 0 }), { pointerId, pointerType });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}

function table() {
  const session = new PointerSession();
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  canvas.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 100, height: 100 });
  const piece = initialSnapshot().table.pieces[0];
  const controls = {
    canHandleTable: true,
    hasDraft: false,
    piece: vi.fn(() => piece),
    point: vi.fn((_piece, x: number, y: number): Vector3Tuple | null => (x < 0 ? null : [x, 0, y])),
    isPublicPoint: (x: number) => x >= 0,
    beginGesture: vi.fn(() => {
      controls.hasDraft = true;
    }),
    updateGesture: vi.fn(),
    finishGesture: vi.fn(),
    cancelDraft: vi.fn(),
    publishPointer: vi.fn(),
    onActiveChange: vi.fn(),
  };
  const binding = { events: window, canvas, read: () => controls };
  const stop = session.bind(binding);
  stops.push(stop);
  return { session, canvas, controls, piece, binding, stop };
}

test('a click captures and releases its pointer without starting a carry', () => {
  const { session, controls, canvas, piece } = table();
  expect(session.press(pointer('pointerdown'), piece.id)).toBe(true);
  window.dispatchEvent(pointer('pointermove', 13));
  window.dispatchEvent(pointer('pointerup', 13));
  expect(controls.beginGesture).not.toHaveBeenCalled();
  expect(controls.finishGesture).not.toHaveBeenCalled();
  expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
  expect(session.busy).toBe(false);
});

/* A finger resting on a deck drifts; within the long-press slop it is still holding for the menu, so it carries nothing. */
test('a finger drifting within the long-press slop does not start a carry, and moving past it does', () => {
  const { session, controls, piece } = table();
  session.press(pointer('pointerdown', 10, 1, 0, 'touch'), piece.id);
  window.dispatchEvent(pointer('pointermove', 10 + LONG_PRESS_SLOP_PX, 1, 100, 'touch'));
  expect(controls.beginGesture).not.toHaveBeenCalled();
  expect(session.isDragging(piece.id)).toBe(false);
  window.dispatchEvent(pointer('pointermove', 11 + LONG_PRESS_SLOP_PX, 1, 120, 'touch'));
  expect(controls.beginGesture).toHaveBeenCalledExactlyOnceWith(piece.id, 'top');
});

test('a press belongs to its own piece until it ends', () => {
  const { session, piece } = table();
  expect(session.isPressing(piece.id)).toBe(false);
  session.press(pointer('pointerdown'), piece.id);
  expect(session.isPressing(piece.id)).toBe(true);
  expect(session.isPressing('another-piece')).toBe(false);
  window.dispatchEvent(pointer('pointerup', 10));
  expect(session.isPressing(piece.id)).toBe(false);
});

test.each([
  [319, 'top'],
  [320, 'whole'],
] as const)('mesh pickup after %i ms keeps the existing %s selection', (elapsed, pickup) => {
  const { session, controls, piece } = table();
  session.press(pointer('pointerdown'), piece.id);
  window.dispatchEvent(pointer('pointermove', 14, 1, elapsed));
  expect(controls.beginGesture).toHaveBeenCalledWith(piece.id, pickup);
  expect(controls.updateGesture).toHaveBeenCalledWith([14, 0, 10]);
  window.dispatchEvent(pointer('pointerup', 20, 1, elapsed + 10));
  window.dispatchEvent(pointer('pointerup', 30, 1, elapsed + 20));
  expect(controls.finishGesture).toHaveBeenCalledExactlyOnceWith([20, 0, 10]);
});

test('other pointers cannot cancel, replace, move or drop the active carry', () => {
  const { session, controls, piece } = table();
  session.press(pointer('pointerdown'), piece.id);
  expect(session.press(pointer('pointerdown', 10, 2), piece.id)).toBe(false);
  window.dispatchEvent(pointer('pointermove', -10, 2));
  window.dispatchEvent(pointer('pointerup', 25, 2));
  window.dispatchEvent(pointer('pointercancel', 25, 2));
  expect(session.busy).toBe(true);
  expect(controls.beginGesture).not.toHaveBeenCalled();
  expect(controls.cancelDraft).not.toHaveBeenCalled();
  window.dispatchEvent(pointer('pointerup', 25));
  expect(controls.finishGesture).toHaveBeenCalledExactlyOnceWith([25, 0, 10]);
});

test.each(['Escape', 'blur', 'pointercancel', 'lostpointercapture'])(
  '%s cleans up once and prevents a late drop',
  (reason) => {
    const { session, controls, canvas, piece } = table();
    session.carry(pointer('pointerdown'), piece.id, 'whole');
    if (reason === 'Escape') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } else if (reason === 'lostpointercapture') {
      canvas.dispatchEvent(pointer(reason));
    } else {
      window.dispatchEvent(reason === 'blur' ? new Event(reason) : pointer(reason));
    }
    window.dispatchEvent(pointer('pointermove', 30));
    window.dispatchEvent(pointer('pointerup', 30));
    session.cancel();
    expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
    expect(controls.updateGesture).not.toHaveBeenCalled();
    expect(controls.finishGesture).not.toHaveBeenCalled();
    expect(canvas.releasePointerCapture).toHaveBeenCalledTimes(1);
    expect(session.busy).toBe(false);
  }
);

test('a mesh carry cancels when its pointer leaves the public table', () => {
  const { session, controls, piece } = table();
  session.press(pointer('pointerdown'), piece.id);
  window.dispatchEvent(pointer('pointermove', 20));
  window.dispatchEvent(pointer('pointermove', -5));
  window.dispatchEvent(pointer('pointerup', 25));
  expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
  expect(controls.publishPointer).toHaveBeenCalledWith(null);
  expect(controls.finishGesture).not.toHaveBeenCalled();
});

test('panel pickup is immediate and can travel from outside the canvas before dropping on the table', () => {
  const { session, controls, piece } = table();
  session.carry(pointer('pointerdown', -20), piece.id, 'top');
  expect(controls.beginGesture).toHaveBeenCalledExactlyOnceWith(piece.id, 'top');
  window.dispatchEvent(pointer('pointermove', -10));
  expect(controls.cancelDraft).not.toHaveBeenCalled();
  window.dispatchEvent(pointer('pointermove', 20));
  window.dispatchEvent(pointer('pointerup', 25));
  expect(controls.finishGesture).toHaveBeenCalledExactlyOnceWith([25, 0, 10]);
});

test('a panel drop outside the public table cancels without saving', () => {
  const { session, controls, piece } = table();
  session.carry(pointer('pointerdown', -20), piece.id, 'whole');
  window.dispatchEvent(pointer('pointerup', -10));
  expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
  expect(controls.finishGesture).not.toHaveBeenCalled();
});

test('permission loss cancels the active carry and refuses another pickup', () => {
  const { session, controls, piece } = table();
  session.carry(pointer('pointerdown'), piece.id, 'whole');
  controls.canHandleTable = false;
  session.reconcile();
  expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
  expect(session.press(pointer('pointerdown'), piece.id)).toBe(false);
});

test('server cancellation retires pointer listeners without sending a second cancellation', () => {
  const { session, controls, piece } = table();
  session.carry(pointer('pointerdown'), piece.id, 'whole');
  session.reconcile();
  controls.hasDraft = false;
  session.reconcile();
  window.dispatchEvent(pointer('pointerup', 25));
  expect(session.busy).toBe(false);
  expect(controls.cancelDraft).not.toHaveBeenCalled();
  expect(controls.finishGesture).not.toHaveBeenCalled();
});

test('a scene render before the new draft arrives does not retire a pending drag', () => {
  const { session, controls, piece } = table();
  controls.beginGesture.mockImplementation(() => {});
  session.press(pointer('pointerdown'), piece.id);
  window.dispatchEvent(pointer('pointermove', 20));
  session.reconcile();
  controls.hasDraft = true;
  session.reconcile();
  window.dispatchEvent(pointer('pointerup', 25));
  expect(controls.finishGesture).toHaveBeenCalledExactlyOnceWith([25, 0, 10]);
});

test('Escape also cancels a keyboard draft and stops handling keys when the scene unbinds', () => {
  const { controls, stop } = table();
  controls.hasDraft = true;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
  stop();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
});

test('scene replacement retires the old session, and its late cleanup cannot stop a new one', () => {
  const { session, controls, piece, binding, stop } = table();
  session.carry(pointer('pointerdown'), piece.id, 'whole');
  stops.push(session.bind({ ...binding }));
  expect(controls.cancelDraft).toHaveBeenCalledTimes(1);
  session.carry(pointer('pointerdown', 10, 2), piece.id, 'whole');
  stop();
  window.dispatchEvent(pointer('pointerup', 25, 1));
  expect(session.busy).toBe(true);
  window.dispatchEvent(pointer('pointerup', 30, 2));
  expect(controls.finishGesture).toHaveBeenCalledExactlyOnceWith([30, 0, 10]);
});

test('failed capture leaves no active listeners or carry', () => {
  const { session, controls, canvas, piece } = table();
  vi.mocked(canvas.setPointerCapture).mockImplementationOnce(() => {
    throw new Error('The pointer already ended.');
  });
  session.carry(pointer('pointerdown'), piece.id, 'whole');
  window.dispatchEvent(pointer('pointerup', 25));
  expect(session.busy).toBe(false);
  expect(controls.beginGesture).not.toHaveBeenCalled();
  expect(controls.finishGesture).not.toHaveBeenCalled();
  expect(session.press(pointer('pointerdown'), piece.id)).toBe(true);
});

const HAND = { type: 'application/dune-hand', data: 'hand-piece' };

test('a parcel carry is refused while no scene receives parcels', () => {
  const { session, controls } = table();
  expect(session.deliver(pointer('pointerdown', 10, 1, 0, 'touch'), HAND)).toBe(false);
  expect(session.busy).toBe(false);
  expect(controls.onActiveChange).not.toHaveBeenCalled();
});

test('a parcel carried onto the canvas reaches the receiver at the release point, without a scene draft', () => {
  const { session, controls, canvas } = table();
  const receiver = vi.fn();
  stops.push(session.receive(receiver));
  const track = { move: vi.fn(), end: vi.fn() };
  expect(session.deliver(pointer('pointerdown', -20, 1, 0, 'touch'), HAND, track)).toBe(true);
  expect(session.busy).toBe(true);
  expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
  expect(controls.onActiveChange).toHaveBeenLastCalledWith(true);
  window.dispatchEvent(pointer('pointermove', 30, 1, 10, 'touch'));
  expect(track.move).toHaveBeenCalledWith(30, 10);
  window.dispatchEvent(pointer('pointerup', 40, 1, 20, 'touch'));
  expect(receiver).toHaveBeenCalledExactlyOnceWith(HAND, 40, 10);
  expect(track.end).toHaveBeenCalledTimes(1);
  expect(session.busy).toBe(false);
  expect(controls.onActiveChange).toHaveBeenLastCalledWith(false);
  expect(controls.beginGesture).not.toHaveBeenCalled();
  expect(controls.finishGesture).not.toHaveBeenCalled();
  expect(controls.cancelDraft).not.toHaveBeenCalled();
});

test('a parcel released off the canvas is dropped nowhere', () => {
  const { session } = table();
  const receiver = vi.fn();
  stops.push(session.receive(receiver));
  const track = { move: vi.fn(), end: vi.fn() };
  session.deliver(pointer('pointerdown', 10, 1, 0, 'touch'), HAND, track);
  window.dispatchEvent(pointer('pointerup', 140, 1, 10, 'touch'));
  expect(receiver).not.toHaveBeenCalled();
  expect(track.end).toHaveBeenCalledTimes(1);
  expect(session.busy).toBe(false);
});

test.each(['Escape', 'pointercancel', 'permission'])(
  '%s ends a parcel carry without a drop or a draft cancel',
  (reason) => {
    const { session, controls } = table();
    const receiver = vi.fn();
    stops.push(session.receive(receiver));
    const track = { move: vi.fn(), end: vi.fn() };
    session.deliver(pointer('pointerdown', 10, 1, 0, 'touch'), HAND, track);
    if (reason === 'Escape') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    } else if (reason === 'permission') {
      controls.canHandleTable = false;
      session.reconcile();
    } else {
      window.dispatchEvent(pointer(reason, 10, 1, 0, 'touch'));
    }
    window.dispatchEvent(pointer('pointerup', 40, 1, 20, 'touch'));
    expect(receiver).not.toHaveBeenCalled();
    expect(track.end).toHaveBeenCalledTimes(1);
    expect(controls.cancelDraft).not.toHaveBeenCalled();
    expect(session.busy).toBe(false);
  }
);

test('a parcel carry survives scene renders that have no draft', () => {
  const { session } = table();
  const receiver = vi.fn();
  stops.push(session.receive(receiver));
  session.deliver(pointer('pointerdown', 10, 1, 0, 'touch'), HAND);
  session.reconcile();
  window.dispatchEvent(pointer('pointerup', 40, 1, 20, 'touch'));
  expect(receiver).toHaveBeenCalledOnce();
});

test('a replaced receiver cannot unregister its successor', () => {
  const { session } = table();
  const first = vi.fn();
  const second = vi.fn();
  const stopFirst = session.receive(first);
  stops.push(session.receive(second));
  stopFirst();
  session.deliver(pointer('pointerdown', 10, 1, 0, 'touch'), HAND);
  window.dispatchEvent(pointer('pointerup', 40, 1, 20, 'touch'));
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledOnce();
});

test('a parcel and a piece carry refuse each other while one is under way', () => {
  const { session, piece } = table();
  stops.push(session.receive(vi.fn()));
  session.press(pointer('pointerdown'), piece.id);
  expect(session.deliver(pointer('pointerdown', 10, 2, 0, 'touch'), HAND)).toBe(false);
  window.dispatchEvent(pointer('pointerup', 10));
  expect(session.deliver(pointer('pointerdown', 10, 3, 0, 'touch'), HAND)).toBe(true);
  expect(session.press(pointer('pointerdown', 10, 4), piece.id)).toBe(false);
});

test('another finger cannot move, drop or cancel a parcel carry', () => {
  const { session } = table();
  const receiver = vi.fn();
  stops.push(session.receive(receiver));
  const track = { move: vi.fn(), end: vi.fn() };
  session.deliver(pointer('pointerdown', 10, 1, 0, 'touch'), HAND, track);
  window.dispatchEvent(pointer('pointermove', 30, 2, 5, 'touch'));
  window.dispatchEvent(pointer('pointerup', 30, 2, 10, 'touch'));
  window.dispatchEvent(pointer('pointercancel', 30, 2, 10, 'touch'));
  expect(track.move).not.toHaveBeenCalled();
  expect(receiver).not.toHaveBeenCalled();
  expect(session.busy).toBe(true);
  window.dispatchEvent(pointer('pointerup', 40, 1, 20, 'touch'));
  expect(receiver).toHaveBeenCalledExactlyOnceWith(HAND, 40, 10);
});
