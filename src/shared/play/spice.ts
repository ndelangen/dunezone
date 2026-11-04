import type { TablePiece } from './model';

/* A spice token is 70% the size of a troop token, every way. */
const SPICE_SCALE = 0.7;
export const SPICE_TOKEN_RADIUS = 0.16 * SPICE_SCALE;
export const SPICE_FOOTPRINT_RADIUS = 0.175 * SPICE_SCALE;
export const SPICE_LAYER_HEIGHT = 0.045 * SPICE_SCALE;
export const SPICE_LAYER_PITCH = 0.0375 * SPICE_SCALE;

type SpiceIdentity = Pick<TablePiece, 'kind'> & Partial<Pick<TablePiece, 'owner' | 'stackKey'>>;

export function isSpicePiece<Piece extends SpiceIdentity>(
  piece: Piece | null | undefined
): piece is Piece & { kind: 'marker'; owner: 'shared'; stackKey: 'spice' } {
  return piece?.kind === 'marker' && piece.owner === 'shared' && piece.stackKey === 'spice';
}
