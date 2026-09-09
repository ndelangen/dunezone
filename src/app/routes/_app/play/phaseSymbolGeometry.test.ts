/* @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TABLE_PHASES } from '@shared/play/phases';
import { Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { SVGResult } from 'three/examples/jsm/loaders/SVGLoader.js';
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createPhaseRingGeometry,
  createPhaseSymbolGeometry,
  loadPhaseSymbolGeometry,
  PHASE_SYMBOL_HEIGHT,
} from './phaseSymbolGeometry';
import { PHASE_RING_INNER_RADIUS, PHASE_RING_OUTER_RADIUS, PHASE_SYMBOL_MAX_RADIUS } from './phaseSymbolLayout';
import { PHASE_TRACKER_RADIUS } from './tableTrackers';

const mediaDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../media');

afterEach(() => vi.restoreAllMocks());

function signedVolume(geometry: BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  let volume = 0;
  for (let index = 0; index < position.count; index += 3) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    volume += a.dot(b.cross(c)) / 6;
  }
  return volume;
}

function hasTopFaceAt(geometry: BufferGeometry, x: number, z: number) {
  const material = new MeshBasicMaterial();
  const mesh = new Mesh(geometry, material);
  const hits = new Raycaster(new Vector3(x, 1, z), new Vector3(0, -1, 0)).intersectObject(mesh);
  material.dispose();
  return hits.length > 0;
}

describe('extruded phase symbols', () => {
  test.each(TABLE_PHASES)('fits the $label artwork into its well with outward-facing caps', (phase) => {
    const source = readFileSync(resolve(mediaDirectory, phase.symbol.slice(1)), 'utf8');
    const geometry = createPhaseSymbolGeometry(new SVGLoader().parse(source), PHASE_TRACKER_RADIUS)!;
    expect(geometry).not.toBeNull();
    try {
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      let upwardCaps = 0;
      let downwardCaps = 0;
      for (let index = 0; index < position.count; index += 1) {
        const radialDistance = Math.hypot(position.getX(index), position.getZ(index));
        expect(radialDistance).toBeLessThanOrEqual(PHASE_TRACKER_RADIUS * PHASE_SYMBOL_MAX_RADIUS + 0.000001);
        expect(PHASE_TRACKER_RADIUS * PHASE_RING_INNER_RADIUS - radialDistance).toBeGreaterThanOrEqual(
          PHASE_TRACKER_RADIUS * (PHASE_RING_INNER_RADIUS - PHASE_SYMBOL_MAX_RADIUS) - 0.000001
        );
        expect(position.getY(index)).toBeGreaterThan(0);
        if (normal.getY(index) > 0.99) {
          upwardCaps += 1;
          expect(position.getY(index)).toBeCloseTo(geometry.boundingBox!.max.y, 6);
        }
        if (normal.getY(index) < -0.99) {
          downwardCaps += 1;
          expect(position.getY(index)).toBeCloseTo(geometry.boundingBox!.min.y, 6);
        }
      }
      expect(upwardCaps).toBeGreaterThan(0);
      expect(downwardCaps).toBeGreaterThan(0);
      expect(geometry.boundingBox!.max.y - geometry.boundingBox!.min.y).toBeCloseTo(PHASE_SYMBOL_HEIGHT, 6);
      expect(signedVolume(geometry)).toBeGreaterThan(0);
    } finally {
      geometry.dispose();
    }
  });

  test('makes a raised circular ring with an open center and clearance around the artwork', () => {
    const ring = createPhaseRingGeometry(PHASE_TRACKER_RADIUS);
    const symbol = createPhaseSymbolGeometry(
      new SVGLoader().parse(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H90V90Z"/></svg>'
      ),
      PHASE_TRACKER_RADIUS
    )!;
    try {
      expect(hasTopFaceAt(ring, 0, 0)).toBe(false);
      expect(hasTopFaceAt(ring, PHASE_TRACKER_RADIUS * 0.8, 0)).toBe(false);
      expect(hasTopFaceAt(ring, PHASE_TRACKER_RADIUS * 0.9, 0)).toBe(true);
      expect(hasTopFaceAt(ring, PHASE_TRACKER_RADIUS * 0.96, 0)).toBe(false);

      const position = ring.getAttribute('position');
      for (let index = 0; index < position.count; index += 1) {
        const radialDistance = Math.hypot(position.getX(index), position.getZ(index));
        expect(radialDistance).toBeGreaterThanOrEqual(PHASE_TRACKER_RADIUS * PHASE_RING_INNER_RADIUS - 0.000001);
        expect(radialDistance).toBeLessThanOrEqual(PHASE_TRACKER_RADIUS * PHASE_RING_OUTER_RADIUS + 0.000001);
      }
      expect(ring.boundingBox!.min.y).toBeGreaterThan(0);
      expect(ring.boundingBox!.min.y).toBeCloseTo(symbol.boundingBox!.min.y, 6);
      expect(ring.boundingBox!.max.y).toBeCloseTo(symbol.boundingBox!.max.y, 6);
      expect(ring.boundingBox!.max.y - ring.boundingBox!.min.y).toBeCloseTo(PHASE_SYMBOL_HEIGHT, 6);
      const expectedVolume =
        Math.PI *
        PHASE_TRACKER_RADIUS ** 2 *
        (PHASE_RING_OUTER_RADIUS ** 2 - PHASE_RING_INNER_RADIUS ** 2) *
        PHASE_SYMBOL_HEIGHT;
      expect(Math.abs(signedVolume(ring) / expectedVolume - 1)).toBeLessThan(0.001);
    } finally {
      ring.dispose();
      symbol.dispose();
    }
  });

  test('keeps a hole open through both faces of the solid', () => {
    const svg = new SVGLoader().parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="M0 0H100V100H0Z M30 30H70V70H30Z"/></svg>'
    );
    const geometry = createPhaseSymbolGeometry(svg, PHASE_TRACKER_RADIUS)!;
    try {
      expect(hasTopFaceAt(geometry, 0, 0)).toBe(false);
      expect(hasTopFaceAt(geometry, 0.1, 0)).toBe(true);
      const width = geometry.boundingBox!.max.x - geometry.boundingBox!.min.x;
      expect(signedVolume(geometry)).toBeCloseTo(width * width * (1 - 0.4 ** 2) * PHASE_SYMBOL_HEIGHT, 7);
    } finally {
      geometry.dispose();
    }
  });

  test('keeps the SVG top facing the far edge of the table without mirroring left and right', () => {
    const svg = new SVGLoader().parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H90V90Z"/></svg>'
    );
    const geometry = createPhaseSymbolGeometry(svg, PHASE_TRACKER_RADIUS)!;
    try {
      expect(hasTopFaceAt(geometry, -0.06, -0.08)).toBe(true);
      expect(hasTopFaceAt(geometry, -0.06, 0.08)).toBe(false);
      expect(hasTopFaceAt(geometry, 0.08, 0.06)).toBe(true);
    } finally {
      geometry.dispose();
    }
  });

  test('leaves the well empty for unavailable fill artwork instead of creating invalid geometry', () => {
    const loader = new SVGLoader();
    expect(createPhaseSymbolGeometry(loader.parse('<svg xmlns="http://www.w3.org/2000/svg"/>'), 0.26)).toBeNull();
    expect(
      createPhaseSymbolGeometry(
        loader.parse('<svg xmlns="http://www.w3.org/2000/svg"><path fill="none" d="M0 0H100V100H0Z"/></svg>'),
        0.26
      )
    ).toBeNull();
  });
});

describe('phase symbol loading lifetime', () => {
  const triangle = () =>
    new SVGLoader().parse(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10H90V90Z"/></svg>'
    );

  test('disposes the mounted symbol once when its owner leaves', async () => {
    const request = Promise.withResolvers<SVGResult>();
    vi.spyOn(SVGLoader.prototype, 'loadAsync').mockReturnValue(request.promise);
    const receive = vi.fn();
    const release = loadPhaseSymbolGeometry('/vector/icon/test.svg', PHASE_TRACKER_RADIUS, receive);
    request.resolve(triangle());
    await request.promise;

    expect(receive).toHaveBeenCalledOnce();
    const geometry: BufferGeometry = receive.mock.calls[0][0];
    const disposed = vi.fn();
    geometry.addEventListener('dispose', disposed);
    release();
    release();
    expect(disposed).toHaveBeenCalledOnce();
  });

  test('ignores a late symbol response after its replacement has loaded', async () => {
    const oldRequest = Promise.withResolvers<SVGResult>();
    const newRequest = Promise.withResolvers<SVGResult>();
    vi.spyOn(SVGLoader.prototype, 'loadAsync')
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const oldReceive = vi.fn();
    const newReceive = vi.fn();
    const oldRelease = loadPhaseSymbolGeometry('/vector/icon/old.svg', PHASE_TRACKER_RADIUS, oldReceive);
    oldRelease();
    const newRelease = loadPhaseSymbolGeometry('/vector/icon/new.svg', PHASE_TRACKER_RADIUS, newReceive);
    newRequest.resolve(triangle());
    await newRequest.promise;
    oldRequest.resolve(triangle());
    await oldRequest.promise;

    expect(oldReceive).not.toHaveBeenCalled();
    expect(newReceive).toHaveBeenCalledOnce();
    newRelease();
  });

  test('keeps a failed image request local to its symbol', async () => {
    vi.spyOn(SVGLoader.prototype, 'loadAsync').mockRejectedValue(new Error('Image unavailable'));
    const receive = vi.fn();
    const release = loadPhaseSymbolGeometry('/vector/icon/missing.svg', PHASE_TRACKER_RADIUS, receive);
    await Promise.resolve();
    await Promise.resolve();
    expect(receive).not.toHaveBeenCalled();
    release();
  });
});
