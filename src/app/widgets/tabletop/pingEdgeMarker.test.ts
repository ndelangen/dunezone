import { describe, expect, it } from 'vite-plus/test';

import { pingEdgePlacement } from './pingEdgeMarker';

const SIZE = { width: 800, height: 600 };
const INSET = 40;
const INSETS = { top: INSET, right: INSET, bottom: INSET, left: INSET };

describe('pingEdgePlacement', () => {
  it('leaves a ping the view shows without a marker', () => {
    expect(pingEdgePlacement([0, 0, -5], [0.5, -0.9], SIZE, INSETS)).toBeNull();
    expect(pingEdgePlacement([0, 0, -5], [1, 1], SIZE, INSETS)).toBeNull();
  });

  it('pins a ping off the right edge to the right edge, pointing right', () => {
    const placement = pingEdgePlacement([3, 0, -5], [2, 0], SIZE, INSETS)!;
    expect(placement.x).toBeCloseTo(SIZE.width - INSET);
    expect(placement.y).toBeCloseTo(SIZE.height / 2);
    expect(placement.angle).toBeCloseTo(0);
  });

  it('pins a ping above the view to the top edge, pointing up', () => {
    const placement = pingEdgePlacement([0, 3, -5], [0, 3], SIZE, INSETS)!;
    expect(placement.x).toBeCloseTo(SIZE.width / 2);
    expect(placement.y).toBeCloseTo(INSET);
    expect(placement.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps the direction from the centre on a diagonal, meeting whichever edge comes first', () => {
    const placement = pingEdgePlacement([0, 0, -5], [-3, -3], SIZE, INSETS)!;
    /* Down and to the left in pixels: 1200 by 900 from the centre, so the bottom edge comes first. */
    expect(placement.y).toBeCloseTo(SIZE.height - INSET);
    expect(placement.x).toBeCloseTo(SIZE.width / 2 - (1200 * (300 - INSET)) / 900);
    expect(placement.angle).toBeCloseTo(Math.atan2(900, -1200));
  });

  it('points a ping behind the camera the way camera space says, not through its flipped projection', () => {
    /* Behind and to the left: the projection lands on the right, but the marker belongs on the left. */
    const placement = pingEdgePlacement([-2, 0, 3], [1.5, 0], SIZE, INSETS)!;
    expect(placement.x).toBeCloseTo(INSET);
    /* Straight left, whichever way round the half turn is told. */
    expect(Math.cos(placement.angle)).toBeCloseTo(-1);
  });

  it('points a ping straight behind the camera down, towards the viewer', () => {
    const placement = pingEdgePlacement([0, 0, 3], [0, 0], SIZE, INSETS)!;
    expect(placement.y).toBeCloseTo(SIZE.height - INSET);
    expect(placement.angle).toBeCloseTo(Math.PI / 2);
  });

  it('keeps clear of each edge by its own inset', () => {
    const insets = { top: 80, right: 40, bottom: 90, left: 40 };
    expect(pingEdgePlacement([0, -3, -5], [0, -3], SIZE, insets)!.y).toBeCloseTo(SIZE.height - 90);
    expect(pingEdgePlacement([0, 3, -5], [0, 3], SIZE, insets)!.y).toBeCloseTo(80);
  });
});
