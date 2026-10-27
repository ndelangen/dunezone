import type { TablePiece } from './model';

/** Whether a piece is a tech token: a stack of them carries the captured asset type on its items. */
export function isTechToken(piece: Partial<Pick<TablePiece, 'items'>>): boolean {
  return piece.items?.[0]?.artwork?.type === 'token-tech';
}

/** The tech tokens a draw can take: those still in the shared table inventory that nobody is carrying. */
export function drawableTechTokens<Piece extends TablePiece>(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((piece) => piece.inventory === 'shared' && !piece.locked && isTechToken(piece));
}
