import type { TablePiece } from './model';

/** The stack key a faction's token keeps on the table for the whole game. */
export function factionTokenStackKey(factionId: string) {
  return `faction-token:${factionId}`;
}

/** A faction's token among the table's pieces, if the table has one. */
export function factionTokenOf<P extends Pick<TablePiece, 'stackKey'>>(
  pieces: readonly P[],
  factionId: string
): P | undefined {
  const key = factionTokenStackKey(factionId);
  return pieces.find((piece) => piece.stackKey === key);
}

/** A faction's own token: one per seated faction, dealt onto the table at setup; it is never a battle leader. */
export function isFactionToken(piece: Partial<Pick<TablePiece, 'kind' | 'stackKey'>>): boolean {
  return piece.kind === 'force' && (piece.stackKey?.startsWith('faction-token:') ?? false);
}

/**
 * Whether a faction's token shows its face: face down signals the faction sits out, as in a bidding round.
 * A table without the token (a game set up before tokens stayed) reads as face up.
 */
export function factionTokenFaceUp(pieces: readonly TablePiece[], factionId: string): boolean {
  return factionTokenOf(pieces, factionId)?.items[0]?.faceUp ?? true;
}
