import { Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import {
  createTurnTrackerFrame,
  createTurnTrackerPointer,
  createTurnTrackerWedge,
  turnTrackerLayout,
} from './turnTrackerGeometry';

describe('turn tracker layout and selection', () => {
  test('numbers clockwise with 1 upper-right and 10 upper-left', () => {
    const layout = turnTrackerLayout({ radius: 1, turn: 1 });
    expect(layout.sectors.map((sector) => sector.turn)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(layout.sectors[0].position[0]).toBeGreaterThan(0);
    expect(layout.sectors[0].position[2]).toBeLessThan(0);
    expect(layout.sectors[9].position[0]).toBeLessThan(0);
    expect(layout.sectors[9].position[2]).toBeLessThan(0);
  });

  /* The first and last turn of the first block and the next, a mid-block turn, and a three-digit turn. */
  test.each([1, 10, 11, 20, 37, 100])('places every label in the block containing turn %i on the face', (turn) => {
    const layout = turnTrackerLayout({ radius: 0.8, turn });
    for (const sector of layout.sectors) {
      expect(sector.position[1]).toBe(0.019);
    }
    expect(layout.sectors[layout.selectedIndex].turn).toBe(turn);
  });

  test('later turns keep a ten-turn block without a turn-ten cap', () => {
    expect(turnTrackerLayout({ radius: 1, turn: 18 }).sectors.map((sector) => sector.turn)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  test('a shorter or longer game shows one sector per turn up to its last turn', () => {
    expect(turnTrackerLayout({ radius: 1, turn: 3, lastTurn: 6 }).sectors.map((sector) => sector.turn)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(turnTrackerLayout({ radius: 1, turn: 1, lastTurn: 15 }).sectors).toHaveLength(15);
  });

  test('past its last turn the wheel keeps counting in blocks of the same size', () => {
    expect(turnTrackerLayout({ radius: 1, turn: 7, lastTurn: 6 }).sectors.map((sector) => sector.turn)).toEqual([
      7, 8, 9, 10, 11, 12,
    ]);
  });

  test.each([
    [4, 1],
    [6, 5],
    [15, 12],
    [1, 1],
  ])('selects the turn on a %i-turn wheel at turn %i', (lastTurn, turn) => {
    const layout = turnTrackerLayout({ radius: 0.8, turn, lastTurn });
    expect(layout.sectors[layout.selectedIndex].turn).toBe(turn);
  });

  test.each([0, -1, NaN, Infinity])('rejects invalid radius %s', (radius) => {
    expect(() => turnTrackerLayout({ radius, turn: 1 })).toThrow(RangeError);
  });

  test.each([0, -1, 1.5, NaN, Infinity])('rejects invalid turn %s', (turn) => {
    expect(() => turnTrackerLayout({ radius: 1, turn })).toThrow(RangeError);
  });
});

type TrackerLayout = ReturnType<typeof turnTrackerLayout>;

/* The turn whose sector holds a point on the tracker face, measured clockwise from the top. */
function sectorTurnAt({ firstTurn, sectorAngle }: TrackerLayout, { x, z }: Readonly<{ x: number; z: number }>) {
  return firstTurn + Math.floor(((Math.atan2(x, -z) + Math.PI * 2) % (Math.PI * 2)) / sectorAngle);
}

describe('turn tracker geometry', () => {
  test('keeps raised frame and pointer within the disc above its top', () => {
    for (const radius of [0.4, 0.8, 1.2]) {
      const layout = turnTrackerLayout({ radius, turn: 1 });
      for (const geometry of [createTurnTrackerFrame(layout), createTurnTrackerPointer(layout)]) {
        const position = geometry.getAttribute('position');
        for (let index = 0; index < position.count; index++) {
          expect(Math.hypot(position.getX(index), position.getZ(index))).toBeLessThan(radius);
          expect(position.getY(index)).toBeGreaterThan(0);
        }
        expect(geometry.boundingBox!.max.y).toBeGreaterThan(geometry.boundingBox!.min.y);
        geometry.dispose();
      }
    }
  });

  test.each([1, 5, 10, 13])('aligns the pointer and gold wedge to turn %i', (turn) => {
    const radius = 0.8;
    const layout = turnTrackerLayout({ radius, turn });
    const pointer = createTurnTrackerPointer(layout);
    pointer.rotateY(-layout.pointerAngle);
    const positions = pointer.getAttribute('position');
    let tip = new Vector3();
    for (let index = 0; index < positions.count; index++) {
      const candidate = new Vector3().fromBufferAttribute(positions, index);
      if (Math.hypot(candidate.x, candidate.z) > Math.hypot(tip.x, tip.z)) {
        tip = candidate;
      }
    }
    expect(sectorTurnAt(layout, tip)).toBe(turn);
    const wedge = createTurnTrackerWedge(layout);
    const vertices = wedge.getAttribute('position');
    const center = new Vector3();
    for (let index = 0; index < vertices.count; index++) {
      center.add(new Vector3().fromBufferAttribute(vertices, index));
    }
    center.divideScalar(vertices.count);
    expect(sectorTurnAt(layout, center)).toBe(turn);
    expect(wedge.boundingBox!.max.y).toBeLessThan(pointer.boundingBox!.min.y);
    pointer.dispose();
    wedge.dispose();
  });
});
