import { Matrix4, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import {
  createTurnTrackerFrame,
  createTurnTrackerPointer,
  createTurnTrackerWedge,
  turnAtTrackerPoint,
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

  test.each([1, 10, 11, 20, 21, 37, 100])('selects every label in the block containing turn %i', (turn) => {
    const layout = turnTrackerLayout({ radius: 0.8, turn });
    for (const sector of layout.sectors) {
      expect(turnAtTrackerPoint(layout, { x: sector.position[0], z: sector.position[2] })).toBe(sector.turn);
      expect(sector.position[1]).toBe(0.019);
    }
    expect(layout.sectors[layout.selectedIndex].turn).toBe(turn);
  });

  test('later turns keep a ten-turn block without a turn-ten cap', () => {
    expect(turnTrackerLayout({ radius: 1, turn: 18 }).sectors.map((sector) => sector.turn)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  test('rejects the hub, positions outside the disc and invalid coordinates', () => {
    const layout = turnTrackerLayout({ radius: 1, turn: 1 });
    expect(turnAtTrackerPoint(layout, { x: 0, z: 0 })).toBeNull();
    expect(turnAtTrackerPoint(layout, { x: 1.001, z: 0 })).toBeNull();
    expect(turnAtTrackerPoint(layout, { x: NaN, z: 0 })).toBeNull();
    expect(turnAtTrackerPoint(layout, { x: 0, z: Infinity })).toBeNull();
    expect(turnAtTrackerPoint(layout, { x: 0.001, z: -0.8 })).toBe(1);
    expect(turnAtTrackerPoint(layout, { x: -0.001, z: -0.8 })).toBe(10);
  });

  test('selects the same sector after a transformed tracker hit is converted to local space', () => {
    const transform = new Matrix4().makeRotationY(0.6).setPosition(3, 0.7, -5);
    const layout = turnTrackerLayout({ radius: 0.7, turn: 13 });
    const sector = layout.sectors[5];
    const world = new Vector3(...sector.position).applyMatrix4(transform);
    const local = world.applyMatrix4(transform.clone().invert());
    expect(turnAtTrackerPoint(layout, local)).toBe(16);
  });

  test.each([0, -1, NaN, Infinity])('rejects invalid radius %s', (radius) => {
    expect(() => turnTrackerLayout({ radius, turn: 1 })).toThrow(RangeError);
  });

  test.each([0, -1, 1.5, NaN, Infinity])('rejects invalid turn %s', (turn) => {
    expect(() => turnTrackerLayout({ radius: 1, turn })).toThrow(RangeError);
  });
});

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
    expect(turnAtTrackerPoint(layout, tip)).toBe(turn);
    const wedge = createTurnTrackerWedge(layout);
    const vertices = wedge.getAttribute('position');
    const center = new Vector3();
    for (let index = 0; index < vertices.count; index++) {
      center.add(new Vector3().fromBufferAttribute(vertices, index));
    }
    center.divideScalar(vertices.count);
    expect(turnAtTrackerPoint(layout, center)).toBe(turn);
    expect(wedge.boundingBox!.max.y).toBeLessThan(pointer.boundingBox!.min.y);
    pointer.dispose();
    wedge.dispose();
  });
});
