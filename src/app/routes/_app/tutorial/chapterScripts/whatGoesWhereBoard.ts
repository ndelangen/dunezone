import { CENTER, RADIUS } from '@shared/boards/geometry';
import { propertyId } from '@shared/boards/schema';
import { boardTerritory } from '@shared/boards/tableTerritories';
import { boardTerritoryAt } from '@shared/boards/territories';
import type { GameSnapshot } from '@shared/play/protocol';
import { revealedSpiceBlow } from '@shared/play/spiceBlowPlacement';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';

import type { Piece } from './guideChecks';

/* Loaded only while this chapter runs: board geometry names the territory a revealed card lights. */
export type SpiceBlow = Readonly<{ card: string; amount: number; territories: readonly string[]; name: string }>;

/**
 * The spice a pile on the table asks for, read from its face-up top card as the table reads it to light the territory and to offer Place spice: a revealed card counts wherever it lies, on its own or on top of a discard pile.
 */
export function spiceBlow(snapshot: GameSnapshot, piece: Piece): SpiceBlow | undefined {
  const revealed = revealedSpiceBlow(piece);
  if (!revealed) {
    return undefined;
  }
  const { item, blow } = revealed;
  const board = snapshot.board?.definition;
  const first = blow.territories[0]!;
  const name = (board && boardTerritory(board, first)?.name) ?? item.artwork?.name ?? first;
  return { card: item.id, amount: blow.amount, territories: blow.territories, name };
}

export function territory(snapshot: GameSnapshot, piece: Pick<Piece, 'position'>): string | undefined {
  const board = snapshot.board?.definition;
  const found =
    board &&
    boardTerritoryAt(board, [
      CENTER[0] + (piece.position[0] * RADIUS) / BOARD_RADIUS,
      CENTER[1] + (piece.position[2] * RADIUS) / BOARD_RADIUS,
    ]);
  return found && propertyId(found);
}
