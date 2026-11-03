import { describe, expect, test } from 'vite-plus/test';

import { factionOfToken, factionTokenOnRay, factionTokenPieceUnder } from './bribes';
import { factionTokenStackKey } from './factionToken';
import type { TablePiece, Vector3Tuple } from './model';
import { FACTION_TOKEN_SCALE, restingPositionAt, stackTopHeight, TROOP_TOP_RADIUS } from './tableGeometry';

function token(factionId: string, at: Vector3Tuple): TablePiece {
  const piece: TablePiece = {
    id: `token-${factionId}`,
    label: factionId,
    owner: 'shared',
    color: '#888888',
    accent: '#cccccc',
    items: [{ id: `token-${factionId}-1`, faceUp: true }],
    stackKey: factionTokenStackKey(factionId),
    position: at,
    orientation: 0,
    flipRevision: 0,
    zoneId: null,
    locked: false,
    kind: 'force',
  };
  return { ...piece, position: restingPositionAt(at, piece) };
}

/* The drawn face's radius: the token is this wide on screen. */
const FACE_RADIUS = TROOP_TOP_RADIUS * FACTION_TOKEN_SCALE;
/* A low camera behind the near edge of the table, looking across it as the default map view does. */
const CAMERA: Vector3Tuple = [0, 6.2, 9.4];

/* The ray from the camera through `point`. */
function rayThrough(point: Vector3Tuple) {
  const direction = point.map((value, axis) => value - CAMERA[axis]!) as Vector3Tuple;
  return { origin: CAMERA, direction };
}

describe('the faction token spice is let go over', () => {
  const far = token('atreides', [0, 0, -4.39]);
  const pieces = [far];
  const face = far.position[1] + stackTopHeight(far);

  test.each([
    ['middle', [0, face, -4.39]],
    ['near edge of the face', [0, face, -4.39 + FACE_RADIUS * 0.95]],
    ['far edge of the face', [0, face, -4.39 - FACE_RADIUS * 0.95]],
    ['left edge of the face', [-FACE_RADIUS * 0.95, face, -4.39]],
    ['near side wall', [0, far.position[1] + 0.01, -4.39 + FACE_RADIUS]],
  ] as const)('the pointer seen over its %s counts', (_, point) => {
    expect(factionOfToken(factionTokenOnRay(pieces, rayThrough([...point])))).toBe('atreides');
  });

  test('the pointer seen beside it does not', () => {
    expect(factionTokenOnRay(pieces, rayThrough([FACE_RADIUS * 1.3, face, -4.39]))).toBeUndefined();
    expect(factionTokenOnRay(pieces, rayThrough([0, face, -4.39 - FACE_RADIUS * 1.3]))).toBeUndefined();
  });

  test('of two tokens in line, the one nearer the camera counts', () => {
    const near = token('harkonnen', [0, 0, -3.6]);
    const point: Vector3Tuple = [0, near.position[1] + 0.01, -3.6 + FACE_RADIUS * 0.9];
    expect(factionOfToken(factionTokenOnRay([far, near], rayThrough(point)))).toBe('harkonnen');
  });

  test('where it would land counts over the whole token', () => {
    expect(factionTokenPieceUnder(pieces, [FACE_RADIUS * 0.95, 0.62, -4.39])).toBe(far);
    expect(factionTokenPieceUnder(pieces, [0, 0.62, -4.39 + FACE_RADIUS * 1.3])).toBeUndefined();
  });
});
