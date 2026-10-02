import type { TablePiece, Vector3Tuple } from './model';
import {
  isSpicePiece,
  SPICE_FOOTPRINT_RADIUS,
  SPICE_LAYER_HEIGHT,
  SPICE_LAYER_PITCH,
  SPICE_MAX_VISIBLE_LAYERS,
} from './spice';

type PieceFootprint = Pick<TablePiece, 'kind' | 'orientation'> & Partial<Pick<TablePiece, 'owner' | 'stackKey'>>;

export const BOARD_RADIUS = 4.25;
export const BOARD_RIM_RADIUS = 4.52;
export const TABLE_VISIBLE_RADIUS = 5.47;
export const BOARD_SURFACE_Y = 0.132;
export const BOARD_RIM_SURFACE_Y = 0.125;
export const TABLE_SURFACE_Y = 0.005;
export const CARRIED_BASE_Y = 0.38;
export const CONTACT_SHADOW_EPSILON = 0.003;

export const FORCE_LAYER_HEIGHT = 0.09 * 0.5;
export const FORCE_LAYER_PITCH = 0.075 * 0.5;
export const FORCE_TOP_RADIUS = 0.31 * 0.5;
export const FORCE_BOTTOM_RADIUS = 0.33 * 0.5;
/* A token's published face is as wide as its top (FORCE_TOP_RADIUS), so the art is as large as the token. */
export const FORCE_FACE_RADIUS = 0.31 * 0.5;
export const FORCE_FOOTPRINT_RADIUS = 0.175;
/* A leader disc is twice the diameter of a troop token. */
const LEADER_SCALE = 2;
export const CARD_WIDTH = 0.86;
export const CARD_DEPTH = 1.18;
export const CARD_LAYER_HEIGHT = 0.055;
export const CARD_LAYER_PITCH = 0.043;
export const CARD_FOOTPRINT_HALF_X = 0.49;
export const CARD_FOOTPRINT_HALF_Z = 0.65;
export const MARKER_BASE_HEIGHT = 0.14;
export const MARKER_TOP_RADIUS = 0.45;
export const MARKER_BOTTOM_RADIUS = 0.48;
export const MARKER_CONE_HEIGHT = 0.24;
export const MARKER_CONE_RADIUS = 0.26;
export const MARKER_CONE_CENTER_Y = 0.21;
const MARKER_HEIGHT = MARKER_CONE_CENTER_Y + MARKER_CONE_HEIGHT / 2;
const MAX_VISIBLE_LAYERS = { card: 5, force: 4, marker: 1 } satisfies Record<TablePiece['kind'], number>;
export const MARKER_FOOTPRINT_RADIUS = 0.5;

/** Leaders keep the stack key their faction's setup supply gave them. */
function isLeaderPiece(piece: Partial<Pick<TablePiece, 'kind' | 'stackKey'>>): boolean {
  return piece.kind === 'force' && (piece.stackKey?.startsWith('leader:') ?? false);
}

/** How much wider than a troop token a force piece is drawn and occupies the table. */
export function forceScale(piece: Partial<Pick<TablePiece, 'kind' | 'stackKey'>>): number {
  return isLeaderPiece(piece) ? LEADER_SCALE : 1;
}

/** Published square and rectangle tokens retain their whole face and aspect ratio. */
export function tokenBoxRatio(piece: Pick<TablePiece, 'items'>): number | null {
  const type = piece.items[0]?.artwork?.type;
  return type === 'token-plate' ? 1 : type === 'token-enhance' ? 372 / 600 : null;
}

export function surfaceHeightAt(position: Vector3Tuple): number {
  const radius = Math.hypot(position[0], position[2]);
  if (radius <= BOARD_RADIUS) {
    return BOARD_SURFACE_Y;
  }
  if (radius <= BOARD_RIM_RADIUS) {
    return BOARD_RIM_SURFACE_Y;
  }
  return TABLE_SURFACE_Y;
}

function minimumFootprintRadius(position: Vector3Tuple, piece: PieceFootprint): number {
  if (piece.kind !== 'card') {
    const footprintRadius = isSpicePiece(piece)
      ? SPICE_FOOTPRINT_RADIUS
      : piece.kind === 'marker'
        ? MARKER_FOOTPRINT_RADIUS
        : FORCE_FOOTPRINT_RADIUS * forceScale(piece);
    return Math.max(0, Math.hypot(position[0], position[2]) - footprintRadius);
  }

  const cosine = Math.cos(piece.orientation);
  const sine = Math.sin(piece.orientation);
  const localX = Math.abs(position[0] * cosine - position[2] * sine);
  const localZ = Math.abs(position[0] * sine + position[2] * cosine);
  const distanceX = Math.max(0, localX - CARD_FOOTPRINT_HALF_X);
  const distanceZ = Math.max(0, localZ - CARD_FOOTPRINT_HALF_Z);
  return Math.hypot(distanceX, distanceZ);
}

/** Whether a point on the table, relative to the piece's centre, lies over the piece's footprint. */
export function pieceFootprintContains(offset: Vector3Tuple, piece: PieceFootprint): boolean {
  return minimumFootprintRadius(offset, piece) === 0;
}

export function supportHeightAt(position: Vector3Tuple, piece: PieceFootprint): number {
  return surfaceHeightAt([minimumFootprintRadius(position, piece), 0, 0]);
}

export function restingPositionAt(position: Vector3Tuple, piece: PieceFootprint): Vector3Tuple {
  return [position[0], supportHeightAt(position, piece), position[2]];
}

export function visibleLayerCount(piece: TablePiece): number {
  const maximum = isSpicePiece(piece) ? SPICE_MAX_VISIBLE_LAYERS : MAX_VISIBLE_LAYERS[piece.kind];
  return Math.min(maximum, Math.max(1, piece.items.length));
}

export function stackTopHeight(piece: TablePiece): number {
  const layers = visibleLayerCount(piece);
  if (isSpicePiece(piece)) {
    return SPICE_LAYER_HEIGHT + (layers - 1) * SPICE_LAYER_PITCH;
  }
  if (piece.kind === 'card') {
    return CARD_LAYER_HEIGHT + (layers - 1) * CARD_LAYER_PITCH;
  }
  if (piece.kind === 'force') {
    return FORCE_LAYER_HEIGHT + (layers - 1) * FORCE_LAYER_PITCH;
  }
  return MARKER_HEIGHT;
}

export function stackPreviewPositionFor(target: TablePiece): Vector3Tuple {
  return [target.position[0], target.position[1] + stackTopHeight(target), target.position[2]];
}

export function pieceLabelHeight(piece: TablePiece): number {
  return stackTopHeight(piece) + (piece.kind === 'card' ? 0.14 : 0.12);
}

function contactShadowBase(piece: TablePiece | TablePiece['kind']): [number, number] {
  if (typeof piece !== 'string' && isSpicePiece(piece)) {
    const diameter = SPICE_FOOTPRINT_RADIUS * 2 + 0.04;
    return [diameter, diameter];
  }
  const kind = typeof piece === 'string' ? piece : piece.kind;
  if (kind === 'card') {
    return [CARD_FOOTPRINT_HALF_X * 2, CARD_FOOTPRINT_HALF_Z * 2];
  }
  const diameter =
    kind === 'force'
      ? FORCE_FOOTPRINT_RADIUS * 2 * (typeof piece === 'string' ? 1 : forceScale(piece)) + 0.04
      : MARKER_FOOTPRINT_RADIUS * 2;
  return [diameter, diameter];
}

export function contactShadowScale(
  piece: TablePiece | TablePiece['kind'],
  carried: boolean
): [x: number, z: number, depth: number] {
  const base = contactShadowBase(piece);
  const expansion = carried ? 1.14 : 1;
  return [base[0] * expansion, base[1] * expansion, 1];
}

export function contactShadowOpacity(carried: boolean): number {
  return carried ? 0.14 : 0.3;
}

export function contactShadowHeightAt(position: Vector3Tuple, piece: PieceFootprint): number {
  return supportHeightAt(position, piece) + CONTACT_SHADOW_EPSILON;
}

export function pointOnRayAtHeight(origin: Vector3Tuple, direction: Vector3Tuple, height: number): Vector3Tuple | null {
  if (Math.abs(direction[1]) < Number.EPSILON) {
    return null;
  }
  const distance = (height - origin[1]) / direction[1];
  if (distance < 0) {
    return null;
  }
  return [origin[0] + direction[0] * distance, height, origin[2] + direction[2] * distance];
}
