import type { TablePiece } from '@shared/play/model';
import { hasHiddenFace } from '@shared/play/peeking';
import { isSpicePiece } from '@shared/play/spice';

/* A token lying face down, whose other face a faction can peek at; cards always have a menu of their own. */
export function peekableToken(piece: TablePiece) {
  return piece.kind === 'force' && !isSpicePiece(piece) && hasHiddenFace(piece);
}
