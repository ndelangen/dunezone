/* @vitest-environment jsdom */
import { expect, test } from 'vite-plus/test';

import { edgeMarker, showEdgeMarker } from './ScenePings';

test('a marker re-measured while it shows hides once its ping comes into view', () => {
  const marker = edgeMarker('#c00');
  showEdgeMarker(marker, { x: 760, y: 300, angle: 0 });
  expect(marker.element.hasAttribute('data-shown')).toBe(true);
  /* What a re-measure leaves: the next frame must write whatever it finds, even nothing to show. */
  marker.shown = null;
  showEdgeMarker(marker, null);
  expect(marker.element.hasAttribute('data-shown')).toBe(false);
});

test('a re-measured marker still out of view moves to its new place', () => {
  const marker = edgeMarker('#c00');
  showEdgeMarker(marker, { x: 760, y: 300, angle: 0 });
  marker.shown = null;
  showEdgeMarker(marker, { x: 560, y: 300, angle: 0 });
  expect(marker.element.style.transform).toBe('translate3d(560px,300px,0)');
});
