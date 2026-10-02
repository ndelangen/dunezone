/* @vitest-environment jsdom */
import { expect, test, vi } from 'vitest';

import { watchTwoFingerTilt } from './twoFingerTilt';

function pointer(type: string, pointerId: number, clientY: number, pointerType = 'touch') {
  return Object.assign(new MouseEvent(type, { clientY, bubbles: true }), { pointerId, pointerType });
}

function board() {
  const surface = document.createElement('canvas');
  const parent = document.createElement('div');
  parent.append(surface);
  const onStart = vi.fn();
  const onTilt = vi.fn();
  const pressed = vi.fn();
  parent.addEventListener('pointerdown', pressed);
  const stop = watchTwoFingerTilt(surface, window, { onStart, onTilt });
  return { surface, onStart, onTilt, pressed, stop };
}

test('two fingers moving up tilt toward top-down by how far they moved together', () => {
  const { surface, onStart, onTilt, pressed, stop } = board();
  surface.dispatchEvent(pointer('pointerdown', 1, 300));
  surface.dispatchEvent(pointer('pointerdown', 2, 320));
  expect(onStart).toHaveBeenCalledOnce();
  /* The table under the board saw the first finger only. */
  expect(pressed).toHaveBeenCalledOnce();
  window.dispatchEvent(pointer('pointermove', 1, 280));
  window.dispatchEvent(pointer('pointermove', 2, 300));
  expect(onTilt.mock.calls.map(([delta]) => delta)).toEqual([10, 10]);
  stop();
});

test('one finger, a mouse, or a finger left after the other lifts does not tilt', () => {
  const { surface, onStart, onTilt, stop } = board();
  surface.dispatchEvent(pointer('pointerdown', 1, 300));
  window.dispatchEvent(pointer('pointermove', 1, 200));
  surface.dispatchEvent(pointer('pointerdown', 5, 300, 'mouse'));
  window.dispatchEvent(pointer('pointermove', 5, 100, 'mouse'));
  surface.dispatchEvent(pointer('pointerdown', 2, 300));
  window.dispatchEvent(pointer('pointerup', 2, 300));
  window.dispatchEvent(pointer('pointermove', 1, 100));
  expect(onStart).toHaveBeenCalledOnce();
  expect(onTilt).not.toHaveBeenCalled();
  stop();
});

test('a third finger lifting leaves the other two tilting', () => {
  const { surface, onTilt, stop } = board();
  surface.dispatchEvent(pointer('pointerdown', 1, 300));
  surface.dispatchEvent(pointer('pointerdown', 2, 300));
  surface.dispatchEvent(pointer('pointerdown', 3, 500));
  window.dispatchEvent(pointer('pointerup', 3, 500));
  window.dispatchEvent(pointer('pointermove', 1, 280));
  expect(onTilt).toHaveBeenCalledWith(10);
  stop();
});

test('stopping lets go of the board', () => {
  const { surface, onStart, stop } = board();
  stop();
  surface.dispatchEvent(pointer('pointerdown', 1, 300));
  surface.dispatchEvent(pointer('pointerdown', 2, 300));
  expect(onStart).not.toHaveBeenCalled();
});
