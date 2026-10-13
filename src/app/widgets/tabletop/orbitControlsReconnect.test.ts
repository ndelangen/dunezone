// @vitest-environment jsdom

import { PerspectiveCamera } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { expect, test } from 'vitest';

/* The controls' own record of a held Control key, which scales trackpad pinches. */
const controlHeld = (controls: OrbitControls) => (controls as unknown as { _controlActive: boolean })._controlActive;

test('controls moved to a new canvas while Control is held do not keep thinking it is held', () => {
  const first = document.body.appendChild(document.createElement('canvas'));
  const controls = new OrbitControls(new PerspectiveCamera(), first);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
  expect(controlHeld(controls)).toBe(true);

  /* Leaving the first canvas drops the keyup listener that would have cleared it. */
  first.remove();
  controls.connect(document.body.appendChild(document.createElement('canvas')));
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
  expect(controlHeld(controls)).toBe(false);
  controls.dispose();
});

test('a table that left the page stops listening for keys on the document', () => {
  const canvas = document.body.appendChild(document.createElement('canvas'));
  const controls = new OrbitControls(new PerspectiveCamera(), canvas);
  canvas.remove();
  controls.dispose();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
  expect(controlHeld(controls)).toBe(false);
});
