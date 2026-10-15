// @vitest-environment jsdom

import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { expect, test } from 'vite-plus/test';

function connectedControls() {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 0, 10);
  const canvas = document.body.appendChild(document.createElement('canvas'));
  return { camera, canvas, controls: new OrbitControls(camera, canvas) };
}

/* How far a small trackpad pinch (a Control wheel event) moves the camera in. */
function pinchTravel({ camera, canvas, controls }: ReturnType<typeof connectedControls>) {
  const before = camera.position.length();
  canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, ctrlKey: true, cancelable: true }));
  controls.update();
  return before - camera.position.length();
}

test('controls moved to a new canvas while Control is held still pinch at full speed', () => {
  const fresh = connectedControls();
  const expected = pinchTravel(fresh);
  fresh.controls.dispose();

  const moved = connectedControls();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
  /* Leaving the first canvas drops the keyup listener that would have noticed Control being released. */
  moved.canvas.remove();
  const next = document.body.appendChild(document.createElement('canvas'));
  moved.controls.connect(next);
  expect(pinchTravel({ ...moved, canvas: next })).toBeCloseTo(expected);
  moved.controls.dispose();
});
