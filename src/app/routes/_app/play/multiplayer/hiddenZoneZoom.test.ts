import { describe, expect, test } from 'vite-plus/test';

import { fitZoom, HIDDEN_ZONE_MAX_ZOOM, UNZOOMED, wheelFactor, zoomAbout } from './hiddenZoneZoom';

/* The side-table zooms about the pointer, within what it shows unzoomed. */
describe('the private side-table zoom', () => {
  const size = { width: 640, height: 280 };
  const scale = 100;

  test('keeps the spot under the pointer where it was', () => {
    const at = { x: 160, y: 70 };
    const zoom = zoomAbout(UNZOOMED, 2, at, scale, size);
    expect(zoom.by).toBe(2);
    /* The table point under the pointer, before and after. */
    expect(zoom.x + at.x / (scale * zoom.by)).toBeCloseTo(at.x / scale);
    expect(zoom.y + at.y / (scale * zoom.by)).toBeCloseTo(at.y / scale);
  });

  test('stops at its closest and at no zoom, and never shows past the unzoomed view', () => {
    expect(zoomAbout(UNZOOMED, 100, { x: 640, y: 280 }, scale, size)).toEqual({
      by: HIDDEN_ZONE_MAX_ZOOM,
      x: 6.4 - 6.4 / HIDDEN_ZONE_MAX_ZOOM,
      y: 2.8 - 2.8 / HIDDEN_ZONE_MAX_ZOOM,
    });
    expect(zoomAbout({ by: 2, x: 1, y: 1 }, 0.1, { x: 0, y: 0 }, scale, size)).toEqual(UNZOOMED);
    expect(fitZoom({ by: 2, x: 5, y: -1 }, scale, size)).toEqual({ by: 2, x: 3.2, y: 0 });
  });

  test('a wheel turned away zooms in, towards the player out', () => {
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
  });
});
