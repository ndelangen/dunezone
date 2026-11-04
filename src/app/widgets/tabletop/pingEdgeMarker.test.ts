import { describe, expect, it } from 'vite-plus/test';

import { pingEdgePlacement } from './pingEdgeMarker';

const SIZE = { width: 800, height: 600 };
const NO_CHROME = { top: 0, right: 0, bottom: 0, left: 0 };
const CLEARANCE = 40;

describe('pingEdgePlacement', () => {
  it('leaves a ping the view shows without a marker', () => {
    expect(pingEdgePlacement([0, 0, -5], [0.5, -0.9], SIZE, NO_CHROME, CLEARANCE)).toBeNull();
    expect(pingEdgePlacement([0, 0, -5], [1, 1], SIZE, NO_CHROME, CLEARANCE)).toBeNull();
  });

  it('pins a ping off the right edge to the right edge, pointing right', () => {
    const placement = pingEdgePlacement([3, 0, -5], [2, 0], SIZE, NO_CHROME, CLEARANCE)!;
    expect(placement.x).toBeCloseTo(SIZE.width - CLEARANCE);
    expect(placement.y).toBeCloseTo(SIZE.height / 2);
    expect(placement.angle).toBeCloseTo(0);
  });

  it('pins a ping above the view to the top edge, pointing up', () => {
    const placement = pingEdgePlacement([0, 3, -5], [0, 3], SIZE, NO_CHROME, CLEARANCE)!;
    expect(placement.x).toBeCloseTo(SIZE.width / 2);
    expect(placement.y).toBeCloseTo(CLEARANCE);
    expect(placement.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('keeps the direction from the centre on a diagonal, meeting whichever edge comes first', () => {
    const placement = pingEdgePlacement([0, 0, -5], [-3, -3], SIZE, NO_CHROME, CLEARANCE)!;
    /* Down and to the left in pixels: 1200 by 900 from the centre, so the bottom edge comes first. */
    expect(placement.y).toBeCloseTo(SIZE.height - CLEARANCE);
    expect(placement.x).toBeCloseTo(SIZE.width / 2 - (1200 * (300 - CLEARANCE)) / 900);
    expect(placement.angle).toBeCloseTo(Math.atan2(900, -1200));
  });

  it('points a ping behind the camera the way camera space says, not through its flipped projection', () => {
    /* Behind and to the left: the projection lands on the right, but the marker belongs on the left. */
    const placement = pingEdgePlacement([-2, 0, 3], [1.5, 0], SIZE, NO_CHROME, CLEARANCE)!;
    expect(placement.x).toBeCloseTo(CLEARANCE);
    /* Straight left, whichever way round the half turn is told. */
    expect(Math.cos(placement.angle)).toBeCloseTo(-1);
  });

  it('points a ping straight behind the camera down, towards the viewer', () => {
    const placement = pingEdgePlacement([0, 0, 3], [0, 0], SIZE, NO_CHROME, CLEARANCE)!;
    expect(placement.y).toBeCloseTo(SIZE.height - CLEARANCE);
    expect(placement.angle).toBeCloseTo(Math.PI / 2);
  });

  it('marks a ping under the chrome, keeping the marker clear of it', () => {
    const chrome = { top: 70, right: 0, bottom: 60, left: 0 };
    /* In the canvas, but under the dock along the bottom. */
    const placement = pingEdgePlacement([0, 0, -5], [0, -0.9], SIZE, chrome, CLEARANCE)!;
    expect(placement.y).toBeCloseTo(SIZE.height - 60 - CLEARANCE);
    expect(placement.angle).toBeCloseTo(Math.PI / 2);
    expect(pingEdgePlacement([0, 0, -5], [0, 0.9], SIZE, chrome, CLEARANCE)!.y).toBeCloseTo(70 + CLEARANCE);
  });

  it('still points at the ping when the canvas is too small to leave room for the marker', () => {
    const placement = pingEdgePlacement([0, -3, -5], [0, -3], { width: 800, height: 180 }, NO_CHROME, 94)!;
    expect(placement.y).toBeCloseTo(90);
    expect(placement.angle).toBeCloseTo(Math.PI / 2);
  });

  it('steps out from under the camera dial in the top right corner, the shortest way', () => {
    const dial = { left: 680, top: 20, right: 780, bottom: 120 };
    /* Off the right edge, a little above the middle: the edge point lies beside the dial, so it moves below it. */
    const placement = pingEdgePlacement([3, 2, -5], [3, 2.4], SIZE, NO_CHROME, CLEARANCE, [dial])!;
    expect(placement.x).toBeCloseTo(SIZE.width - CLEARANCE);
    expect(placement.y).toBeCloseTo(120 + CLEARANCE);
    expect(placement.angle).toBeLessThan(0);
  });

  it('leaves a marker clear of the dial where it is', () => {
    const dial = { left: 680, top: 20, right: 780, bottom: 120 };
    const placement = pingEdgePlacement([3, 0, -5], [2, 0], SIZE, NO_CHROME, CLEARANCE, [dial])!;
    expect(placement.y).toBeCloseTo(SIZE.height / 2);
  });
});
