import { z } from 'zod';

import type { Board } from './schema';
import { territoryId } from './schema';
import { tintColorSchema, tintStampsSchema, tintTerritorySchema } from './tints';

/*
 * Markup an author draws over a saved board: Play's territory tints and freely placed token assets.
 * Spice cards and Rulebook board scenes keep the same markup, so both draw and edit it with the same code.
 */

/** The square frame a saved board draws in, which placed tokens share so a board switch leaves them where the author put them. */
export const BOARD_FRAME_SIZE = 487.06;
export const BOARD_TERRITORY_TYPES = ['sand', 'rock', 'stronghold', 'polar'] as const;
export const BOARD_MAX_TINTS = 12;
export const BOARD_MAX_TOKENS = 64;

/**
 * A Play territory tint as markup keeps it: the same colour, stickers, outline-only look and territory IDs.
 * `types` covers every current territory of a type on the board, resolved when drawn rather than expanded on save;
 * only carried legacy highlights use it.
 */
export const BoardTint = z.strictObject({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(48),
  color: tintColorSchema,
  stamps: tintStampsSchema.optional(),
  outline: z.literal(true).optional(),
  territories: z.array(tintTerritorySchema).max(128),
  types: z.array(z.enum(BOARD_TERRITORY_TYPES)).max(BOARD_TERRITORY_TYPES.length).optional(),
});
export type BoardTint = z.infer<typeof BoardTint>;

/** A token Asset placed on the board, in board coordinates; nothing ties it to a territory. */
export const BoardTokenPlacement = z.strictObject({
  layerId: z.string().min(1).max(64),
  asset_id: z.string().min(1),
  x: z.number().min(0).max(BOARD_FRAME_SIZE),
  y: z.number().min(0).max(BOARD_FRAME_SIZE),
  size: z.number().min(5).max(250),
  rotation: z.number().min(-360).max(360),
});
export type BoardTokenPlacement = z.infer<typeof BoardTokenPlacement>;

export const boardTints = z.array(BoardTint).max(BOARD_MAX_TINTS);
export const boardTokens = z.array(BoardTokenPlacement).max(BOARD_MAX_TOKENS);

/**
 * Toggles one territory in a tint, as a brush click does.
 * A tint carried over from a classic region names territory types;
 * painting by hand spells those out as the board's territories first, so the brush can take any of them away.
 */
export function paintTint(
  tints: readonly BoardTint[],
  board: Board | undefined,
  tintId: string,
  territory: string
): BoardTint[] {
  return tints.map((tint) => {
    if (tint.id !== tintId) {
      return tint;
    }
    const types = new Set<string>(tint.types ?? []);
    const covered = [
      ...new Set([
        ...tint.territories,
        ...(board && types.size
          ? Object.values(board.properties)
              .filter((property) => types.has(property.type))
              .map((property) => territoryId(property.name))
          : []),
      ]),
    ];
    const { types: _types, ...rest } = tint;
    return {
      ...(board ? rest : tint),
      territories: covered.includes(territory) ? covered.filter((id) => id !== territory) : [...covered, territory],
    };
  });
}

/** Moves one placed token, as a drag does. */
export const moveToken = (tokens: readonly BoardTokenPlacement[], layerId: string, x: number, y: number) =>
  tokens.map((token) => (token.layerId === layerId ? { ...token, x, y } : token));
