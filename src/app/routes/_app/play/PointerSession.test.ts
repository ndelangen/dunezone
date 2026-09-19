/* @vitest-environment jsdom */
import { initialSnapshot } from '@shared/play/commands';
import { afterEach, expect, test, vi } from 'vitest';

import type { Vector3Tuple } from './model';
import { PointerSession } from './PointerSession';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) {
    stop();
  }
});

function pointer(type: string, x = 10, pointerId = 1, timeStamp = 0) {
  const event = Object.assign(new MouseEvent(type, { clientX: x, clientY: 10, button: 0 }), { pointerId });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  return event;
}

function table() {
  const session = new PointerSession();
  const canvas = document.createElement('canvas');
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  const piece = initialSnapshot().table.pieces[0];
  const controls = {
    canInteract: true,
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
  controls.canInteract = false;
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
