import { GEAR_OUTLINE } from '@shared/assets/tokenOutline';
import type { BufferGeometry } from 'three';
import { Euler, Matrix4, Vector3 } from 'three';
import { describe, expect, test } from 'vite-plus/test';

import { gearFaceGeometry, gearSlabGeometry } from './gearTokenGeometry';

const RADIUS = 0.155;
const HEIGHT = 0.045;

/* The turns a token's top face and its underside are laid flat by on the table (`PieceFace`). */
const TOP = new Matrix4().makeRotationFromEuler(new Euler(-Math.PI / 2, 0, 0));
const UNDERSIDE = new Matrix4().makeRotationFromEuler(new Euler(Math.PI / 2, 0, Math.PI));

/* A point as a key rounded so the same point read twice matches, minus zero included. */
const key = (x: number, z: number) => `${x.toFixed(5)},${z.toFixed(5)}`.replaceAll('-0.00000', '0.00000');

/* The table points a geometry covers. */
function footprint(geometry: BufferGeometry, turn = new Matrix4()) {
  const position = geometry.attributes.position!;
  const points = new Set<string>();
  for (let index = 0; index < position.count; index++) {
    const point = new Vector3().fromBufferAttribute(position, index).applyMatrix4(turn);
    points.add(key(point.x, point.z));
  }
  return points;
}

/* The page's gear on the table, page right along +x and page down along +z, as the published face is shown. */
const PAGE_GEAR = new Set(GEAR_OUTLINE.map(([x, y]) => key(x * RADIUS, y * RADIUS)));

describe('tech token gear', () => {
  test('the slab and both faces lie on the gear the page cuts the face to', () => {
    expect(footprint(gearSlabGeometry(RADIUS, HEIGHT))).toEqual(PAGE_GEAR);
    expect(footprint(gearFaceGeometry(RADIUS, false), TOP)).toEqual(PAGE_GEAR);
    expect(footprint(gearFaceGeometry(RADIUS, true), UNDERSIDE)).toEqual(PAGE_GEAR);
  });

  test('the slab stands on its centre, as thick as a token layer', () => {
    const geometry = gearSlabGeometry(RADIUS, HEIGHT);
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.y).toBeCloseTo(-HEIGHT / 2);
    expect(geometry.boundingBox!.max.y).toBeCloseTo(HEIGHT / 2);
  });

  test("the top face shows the image the right way up: its top edge away from the viewer, as a disc's does", () => {
    const geometry = gearFaceGeometry(RADIUS, false);
    const position = geometry.attributes.position!;
    const uv = geometry.attributes.uv!;
    for (let index = 0; index < position.count; index++) {
      const point = new Vector3().fromBufferAttribute(position, index).applyMatrix4(TOP);
      expect(uv.getX(index)).toBeCloseTo(point.x / (RADIUS * 2) + 0.5);
      expect(uv.getY(index)).toBeCloseTo(0.5 - point.z / (RADIUS * 2));
    }
  });
});
