import type { TablePiece } from './model';

export const SPICE_TOKEN_RADIUS = 0.16;
export const SPICE_FOOTPRINT_RADIUS = 0.175;
export const SPICE_LAYER_HEIGHT = 0.045;
export const SPICE_LAYER_PITCH = 0.0375;
export const SPICE_MAX_VISIBLE_LAYERS = 4;

type SpiceIdentity = Pick<TablePiece, 'kind'> & Partial<Pick<TablePiece, 'owner' | 'stackKey'>>;

export function isSpicePiece<Piece extends SpiceIdentity>(
  piece: Piece | null | undefined
): piece is Piece & { kind: 'marker'; owner: 'shared'; stackKey: 'spice' } {
  return piece?.kind === 'marker' && piece.owner === 'shared' && piece.stackKey === 'spice';
}
