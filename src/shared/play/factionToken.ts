import type { TablePiece } from './model';

/** The stack key a faction's token keeps on the table for the whole game. */
export function factionTokenStackKey(factionId: string) {
  return `faction-token:${factionId}`;
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
  const key = factionTokenStackKey(factionId);
  return pieces.find((piece) => piece.stackKey === key)?.items[0]?.faceUp ?? true;
}
