import { deletablePiece } from '@shared/play/commands';
import type { TablePiece } from '@shared/play/model';
import { isSpicePiece } from '@shared/play/spice';

import { peekableToken } from './peekableToken';

/* Whether right-clicking a piece opens its menu: cards, spice, hidden tokens, and anything that can be taken out of the game. */
export function pieceHasMenu(piece: TablePiece) {
  return (
    !piece.inventory && (piece.kind === 'card' || isSpicePiece(piece) || peekableToken(piece) || deletablePiece(piece))
  );
}
