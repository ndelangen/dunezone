import { PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';

import { freshTableState } from './model';
import type { TablePiece, Vector3Tuple } from './model';
import {
  BOARD_RIM_SURFACE_Y,
  BOARD_SURFACE_Y,
  CARRIED_BASE_Y,
  CONTACT_SHADOW_EPSILON,
  contactShadowHeightAt,
  pointOnRayAtHeight,
  surfaceHeightAt,
  supportHeightAt,
  TABLE_SURFACE_Y,
} from './tableGeometry';
import { draftForGesture, settleCarryAtPosition } from './TabletopContext';

function pieceFrom(state: ReturnType<typeof freshTableState>, pieceId: string): TablePiece {
  const piece = state.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    throw new Error(`Missing ${pieceId} fixture`);
  }
  return piece;
}

describe('tabletop contact geometry', () => {
  test.each([
    { label: 'map', position: [2, 0, 0] as Vector3Tuple, expected: BOARD_SURFACE_Y },
    { label: 'rim', position: [4.5, 0, 0] as Vector3Tuple, expected: BOARD_RIM_SURFACE_Y },
    { label: 'table', position: [5, 0, 0] as Vector3Tuple, expected: TABLE_SURFACE_Y },
    {
      label: 'board beneath a territory highlight',
      position: [0.95, 0, -3.05] as Vector3Tuple,
      expected: BOARD_SURFACE_Y,
    },
    {
      label: 'table beneath a reserve-center point',
      position: [-3.4, 0, 3.22] as Vector3Tuple,
      expected: TABLE_SURFACE_Y,
    },
  ])('uses the visible $label as its support', ({ position, expected }) => {
    expect(surfaceHeightAt(position)).toBeCloseTo(expected, 8);
  });

  test('raises a circular piece to the highest surface beneath its footprint', () => {
    const force = { kind: 'force', orientation: 0 } as const;

    expect(supportHeightAt([4.4, 0, 0], force)).toBeCloseTo(BOARD_SURFACE_Y, 8);
    expect(supportHeightAt([4.68, 0, 0], force)).toBeCloseTo(BOARD_RIM_SURFACE_Y, 8);
    expect(supportHeightAt([4.8, 0, 0], force)).toBeCloseTo(TABLE_SURFACE_Y, 8);
  });

  test('uses card orientation when finding the highest surface beneath it', () => {
    const position: Vector3Tuple = [4.8, 0, 0];

    expect(supportHeightAt(position, { kind: 'card', orientation: 0 })).toBeCloseTo(BOARD_RIM_SURFACE_Y, 8);
    expect(supportHeightAt(position, { kind: 'card', orientation: Math.PI / 2 })).toBeCloseTo(BOARD_SURFACE_Y, 8);
  });

  test('all initial pieces rest directly on their visible support surface', () => {
    const state = freshTableState();

    for (const piece of state.pieces) {
      expect(piece.position[1]).toBeCloseTo(supportHeightAt(piece.position, piece), 8);
    }
  });

  test.each(['treachery-card-loose', 'harkonnen-force-loose'])(
    'settles %s to a canonical surface height',
    (pieceId) => {
      const state = freshTableState();
      const piece = pieceFrom(state, pieceId);
      const draft = draftForGesture(piece, 'whole');
      if (!draft) {
        throw new Error(`Could not begin a gesture for ${pieceId}`);
      }
      const lowPointer: Vector3Tuple = [0, -10, 0];
      const highPointer: Vector3Tuple = [0, 10, 0];

      const low = settleCarryAtPosition(state, draft, lowPointer);
      const high = settleCarryAtPosition(state, draft, highPointer);

      expect(low).not.toBeNull();
      expect(high).not.toBeNull();
      expect(low?.position[1]).toBe(supportHeightAt(lowPointer, piece));
      expect(high?.position[1]).toBe(supportHeightAt(highPointer, piece));
    }
  );

  test('settles a rim-straddling force on top of the rim', () => {
    const state = freshTableState();
    const piece = pieceFrom(state, 'harkonnen-force-loose');
    const isolatedState = { ...state, pieces: [piece] };
    const draft = draftForGesture(piece, 'whole');
    if (!draft) {
      throw new Error('Could not begin a force gesture');
    }

    const settled = settleCarryAtPosition(isolatedState, draft, [4.68, CARRIED_BASE_Y, 0]);

    expect(settled).not.toBeNull();
    expect(settled?.position).toEqual([4.68, BOARD_RIM_SURFACE_Y, 0]);
  });

  test.each([
    [0.35, 0.5],
    [-0.35, -0.5],
  ])('keeps a carried point on the pointer ray at NDC %s, %s', (x, y) => {
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 100);
    camera.position.set(0, 9.5, 11.2);
    camera.lookAt(0, 0.1, 0);
    camera.updateMatrixWorld();
    const pointer = new Vector2(x, y);
    const raycaster = new Raycaster();
    raycaster.setFromCamera(pointer, camera);

    const hit = pointOnRayAtHeight(
      [raycaster.ray.origin.x, raycaster.ray.origin.y, raycaster.ray.origin.z],
      [raycaster.ray.direction.x, raycaster.ray.direction.y, raycaster.ray.direction.z],
      CARRIED_BASE_Y
    );

    expect(hit).not.toBeNull();
    if (!hit) {
      return;
    }
    const projectedHit = new Vector3(...hit);
    expect(raycaster.ray.distanceToPoint(projectedHit)).toBeLessThan(1e-8);
    projectedHit.project(camera);
    expect(projectedHit.x).toBeCloseTo(pointer.x, 8);
    expect(projectedHit.y).toBeCloseTo(pointer.y, 8);
  });

  test.each([
    { label: 'resting map piece', position: [2, BOARD_SURFACE_Y, 0] as Vector3Tuple },
    { label: 'carried rim piece', position: [4.5, CARRIED_BASE_Y, 0] as Vector3Tuple },
    {
      label: 'carried reserve piece',
      position: [-3.4, CARRIED_BASE_Y, 3.22] as Vector3Tuple,
    },
  ])('anchors the $label shadow to its support', ({ position }) => {
    const footprint = { kind: 'force', orientation: 0 } as const;
    expect(contactShadowHeightAt(position, footprint)).toBeCloseTo(
      supportHeightAt(position, footprint) + CONTACT_SHADOW_EPSILON,
      8
    );
  });

  test('keeps a straddling piece shadow on the rim instead of sinking into it', () => {
    const position: Vector3Tuple = [4.68, CARRIED_BASE_Y, 0];
    const footprint = { kind: 'force', orientation: 0 } as const;

    expect(contactShadowHeightAt(position, footprint)).toBeCloseTo(BOARD_RIM_SURFACE_Y + CONTACT_SHADOW_EPSILON, 8);
  });
});
