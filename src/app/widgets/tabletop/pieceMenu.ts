import { isBattleLeader } from '@shared/play/battle';
import { deletablePiece } from '@shared/play/commands';
import { isFactionToken } from '@shared/play/factionToken';
import type { TablePiece } from '@shared/play/model';
import { isSpicePiece } from '@shared/play/spice';

import { peekableToken } from './peekableToken';

/*
 * Whether right-clicking a piece opens its menu: cards, spice, hidden tokens, battle leaders (which go back to the
 * hand), faction tokens (which offer an alliance, #2978), and anything that can be taken out of the game.
 */
export function pieceHasMenu(piece: TablePiece) {
  if (piece.inventory) {
    return false;
  }
  return (
    piece.kind === 'card' ||
    isSpicePiece(piece) ||
    peekableToken(piece) ||
    isBattleLeader(piece) ||
    isFactionToken(piece) ||
    deletablePiece(piece)
  );
}
