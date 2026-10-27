import { tokenShapeOfType } from '../assets/tokenOutline';
import { isFactionToken } from './factionToken';
import type { TablePiece, Vector3Tuple } from './model';
import { POINTER_BODY_RADIUS, POINTER_HEIGHT, isPointerToken, pointerCovers, pointerDistanceTo } from './pointerToken';
import {
  isSpicePiece,
  SPICE_FOOTPRINT_RADIUS,
  SPICE_LAYER_HEIGHT,
  SPICE_LAYER_PITCH,
  SPICE_MAX_VISIBLE_LAYERS,
} from './spice';
import { isTroopStack } from './troop';

type PieceFootprint = Pick<TablePiece, 'kind' | 'orientation'> &
  Partial<Pick<TablePiece, 'owner' | 'stackKey' | 'items'>>;

export const BOARD_RADIUS = 3.98;
export const BOARD_RIM_RADIUS = 4.23;
export const TABLE_VISIBLE_RADIUS = 5.47;
export const BOARD_SURFACE_Y = 0.132;
export const BOARD_RIM_SURFACE_Y = 0.125;
export const TABLE_SURFACE_Y = 0.005;
/* Carried pieces glide above the tallest stack on the board: twenty troops show twelve layers and top out near 0.59. */
export const CARRIED_BASE_Y = 0.62;
export const CONTACT_SHADOW_EPSILON = 0.003;

export const TROOP_LAYER_HEIGHT = 0.09 * 0.5;
export const TROOP_LAYER_PITCH = 0.075 * 0.5;
export const TROOP_TOP_RADIUS = 0.31 * 0.5;
export const TROOP_BOTTOM_RADIUS = 0.33 * 0.5;
/* A token's published face is as wide as its top (TROOP_TOP_RADIUS), so the art is as large as the token. */
export const TROOP_FACE_RADIUS = 0.31 * 0.5;
export const TROOP_FOOTPRINT_RADIUS = 0.175;
/* A leader disc is twice the diameter of a troop token. */
const LEADER_SCALE = 2;
/* A faction token is as wide as the seat token swapping shows (radius 0.42), the largest disc at a seat. */
export const FACTION_TOKEN_SCALE = 0.42 / TROOP_TOP_RADIUS;
export const CARD_WIDTH = 0.86;
export const CARD_DEPTH = 1.18;
/* Cards have rounded corners, a little tighter than the wells they sit in. */
export const CARD_CORNER_RADIUS = 0.05;
export const CARD_LAYER_HEIGHT = 0.028;
export const CARD_LAYER_PITCH = 0.022;
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

/** How much wider than a troop token a 'force'-kind piece (a troop, a leader disc or a faction token) is drawn and occupies the table. */
export function troopScale(piece: Partial<Pick<TablePiece, 'kind' | 'stackKey'>>): number {
  if (isFactionToken(piece)) {
    return FACTION_TOKEN_SCALE;
  }
  return isLeaderPiece(piece) ? LEADER_SCALE : 1;
}

/** Published square and rectangle tokens retain their whole face and aspect ratio. */
/** Whether a token is a tech token, which the table cuts to the same ten-tooth gear its face is cut to everywhere else. */
export function isGearToken(piece: Pick<TablePiece, 'items'>): boolean {
  return tokenShapeOfType(piece.items[0]?.artwork?.type) === 'gear';
}

export function tokenBoxRatio(piece: Pick<TablePiece, 'items'>): number | null {
  const type = piece.items[0]?.artwork?.type;
  return type === 'token-plate' ? 1 : type === 'token-enhance' ? 372 / 600 : null;
}

/** How far apart two points lie across the table, whatever their heights. */
export function planarDistance(a: Readonly<Vector3Tuple>, b: Readonly<Vector3Tuple>): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** The candidate `distanceOf` puts nearest, the first of any tie; a candidate it gives null is out of reach. */
export function nearestBy<T>(candidates: Iterable<T>, distanceOf: (candidate: T) => number | null): T | null {
  let nearest: { candidate: T; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = distanceOf(candidate);
    if (distance !== null && (!nearest || distance < nearest.distance)) {
      nearest = { candidate, distance };
    }
  }
  return nearest?.candidate ?? null;
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

/** The radius of a round piece's footprint: a spice stack, a marker, or a troop, leader disc or faction token. */
export function circleFootprintRadius(piece: PieceFootprint): number {
  if (isSpicePiece(piece)) {
    return SPICE_FOOTPRINT_RADIUS;
  }
  if (isPointerToken(piece)) {
    return POINTER_BODY_RADIUS;
  }
  return piece.kind === 'marker' ? MARKER_FOOTPRINT_RADIUS : TROOP_FOOTPRINT_RADIUS * troopScale(piece);
}

function minimumFootprintRadius(position: Vector3Tuple, piece: PieceFootprint): number {
  /* A pointer's point reaches well past its round end, so its whole outline decides what it rests on. */
  if (isPointerToken(piece)) {
    return pointerDistanceTo({ position, orientation: piece.orientation }, [0, 0, 0]);
  }
  if (piece.kind !== 'card') {
    return Math.max(0, Math.hypot(position[0], position[2]) - circleFootprintRadius(piece));
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
  if (isPointerToken(piece)) {
    return pointerCovers({ position: [0, 0, 0], orientation: piece.orientation }, offset);
  }
  return minimumFootprintRadius(offset, piece) === 0;
}

export function supportHeightAt(position: Vector3Tuple, piece: PieceFootprint): number {
  return surfaceHeightAt([minimumFootprintRadius(position, piece), 0, 0]);
}

export function restingPositionAt(position: Vector3Tuple, piece: PieceFootprint): Vector3Tuple {
  return [position[0], supportHeightAt(position, piece), position[2]];
}

/* A troop stack shows one layer per item while it is short, then grows more slowly, so its height still tells a big stack from a bigger one. */
const TROOP_EXACT_LAYERS = 8;

function troopLayerCount(items: number): number {
  return items <= TROOP_EXACT_LAYERS
    ? items
    : Math.round(TROOP_EXACT_LAYERS + 1.2 * Math.sqrt(items - TROOP_EXACT_LAYERS));
}

export function visibleLayerCount(piece: TablePiece): number {
  if (isTroopStack(piece)) {
    return Math.max(1, troopLayerCount(piece.items.length));
  }
  const maximum = isSpicePiece(piece) ? SPICE_MAX_VISIBLE_LAYERS : MAX_VISIBLE_LAYERS[piece.kind];
  return Math.min(maximum, Math.max(1, piece.items.length));
}

export function stackTopHeight(piece: TablePiece): number {
  if (isPointerToken(piece)) {
    return POINTER_HEIGHT;
  }
  const layers = visibleLayerCount(piece);
  if (isSpicePiece(piece)) {
    return SPICE_LAYER_HEIGHT + (layers - 1) * SPICE_LAYER_PITCH;
  }
  if (piece.kind === 'card') {
    return CARD_LAYER_HEIGHT + (layers - 1) * CARD_LAYER_PITCH;
  }
  if (piece.kind === 'force') {
    return TROOP_LAYER_HEIGHT + (layers - 1) * TROOP_LAYER_PITCH;
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
  if (typeof piece !== 'string' && isPointerToken(piece)) {
    const diameter = POINTER_BODY_RADIUS * 2 + 0.04;
    return [diameter, diameter];
  }
  const kind = typeof piece === 'string' ? piece : piece.kind;
  if (kind === 'card') {
    return [CARD_FOOTPRINT_HALF_X * 2, CARD_FOOTPRINT_HALF_Z * 2];
  }
  const diameter =
    kind === 'force'
      ? TROOP_FOOTPRINT_RADIUS * 2 * (typeof piece === 'string' ? 1 : troopScale(piece)) + troopShadowSpread(piece)
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

/* Troops sit in crowds on the map, so their shadow reaches further and darker than other pieces' to keep each stack grounded. */
const TROOP_SHADOW_SPREAD = 0.24;
function troopShadowSpread(piece: TablePiece | TablePiece['kind']) {
  return typeof piece !== 'string' && isTroopStack(piece) ? TROOP_SHADOW_SPREAD : 0.04;
}

export function contactShadowOpacity(carried: boolean, piece?: TablePiece): number {
  if (piece && isTroopStack(piece)) {
    return carried ? 0.3 : 0.75;
  }
  return carried ? 0.14 : 0.3;
}

export function contactShadowHeightAt(position: Vector3Tuple, piece: PieceFootprint): number {
  return supportHeightAt(position, piece) + CONTACT_SHADOW_EPSILON;
}

/** Where a ray from the camera first meets the board, its rim or the table; pieces standing there are left out. */
export function surfacePointOnRay(origin: Vector3Tuple, direction: Vector3Tuple): Vector3Tuple | null {
  for (const height of [BOARD_SURFACE_Y, BOARD_RIM_SURFACE_Y, TABLE_SURFACE_Y]) {
    const point = pointOnRayAtHeight(origin, direction, height);
    if (point && surfaceHeightAt(point) === height) {
      return point;
    }
  }
  return null;
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
