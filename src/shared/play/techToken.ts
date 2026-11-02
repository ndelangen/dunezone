import { z } from 'zod';

import { PhysicalSize } from '../assets/physicalSize';
import { isBattleLeader } from './battle';
import type { StoredPiece, TablePiece } from './model';

/** The asset type a tech token's artwork carries. */
const TECH_TOKEN = 'token-tech';

/** Whether a piece is a tech token: a stack of them carries the captured asset type on its items. */
export function isTechToken(piece: Partial<Pick<TablePiece, 'items'>>): boolean {
  return piece.items?.[0]?.artwork?.type === TECH_TOKEN;
}

/** The tech tokens a draw can take: those still in the shared table inventory that nobody is carrying. */
export function drawableTechTokens<Piece extends TablePiece>(pieces: readonly Piece[]): Piece[] {
  return pieces.filter((piece) => piece.inventory === 'shared' && !piece.locked && isTechToken(piece));
}

/** What a hand takes from the table: one loose, unlocked card, battle leader or tech token, not something already in an inventory. */
export function takeableIntoHand(piece: StoredPiece | TablePiece | undefined): boolean {
  return (
    piece !== undefined &&
    !piece.inventory &&
    !piece.locked &&
    piece.items.length === 1 &&
    (piece.kind === 'card' || isBattleLeader(piece) || isTechToken(piece))
  );
}

/**
 * A tech token a faction holds, as every viewer sees it: its face, name and what it does while it lies face up, and only its back once turned over.
 * It names no piece, so a token played out of a hand cannot be told apart by where it was held.
 */
export const heldTechTokenSchema = z.strictObject({
  back: z.string().url(),
  front: z.string().url().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  size: PhysicalSize.optional(),
});
export type HeldTechToken = z.infer<typeof heldTechTokenSchema>;

/**
 * The tech tokens each listed faction holds in its hand or on its private side-table, by faction id;
 * a faction holding none is left out.
 * Tech tokens are public, so every viewer sees who holds which.
 */
export function heldTechTokens(
  inventories: Readonly<Partial<Record<string, readonly StoredPiece[]>>>,
  factionIds: readonly string[]
): Record<string, HeldTechToken[]> {
  return Object.fromEntries(
    factionIds.flatMap((factionId) => {
      const held = (inventories[factionId] ?? []).filter(isTechToken).flatMap((piece) =>
        piece.items.flatMap(({ faceUp, artwork }) => {
          if (!artwork) {
            return [];
          }
          const { back, front, name, description, size } = artwork;
          const shown = faceUp ? { back, front, name, description, size } : { back, size };
          return [
            Object.fromEntries(Object.entries(shown).filter(([, value]) => value !== undefined)) as HeldTechToken,
          ];
        })
      );
      return held.length ? [[factionId, held]] : [];
    })
  );
}
