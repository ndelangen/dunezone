import { CENTER, RADIUS, retainedArrakisBoard } from '@shared/boards/geometry';
import { propertyId } from '@shared/boards/schema';
import { boardTerritoryAt } from '@shared/boards/territories';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';

import catalogue from '../setup/catalogue.json';
import type { Piece } from './guideChecks';

/* Loaded only while this chapter runs: the catalogue supplies the card's printed amount and the board its territory. */
export type SpiceBlow = Readonly<{ name: string; amount: number; territory: string }>;

export function spiceBlow(piece: Piece): SpiceBlow | undefined {
  const face = piece.items[0];
  if (piece.items.length !== 1 || !face?.faceUp || face.artwork?.type !== 'card-spice') {
    return undefined;
  }
  const card = catalogue.assetSupply['deck/dreamrules-spice-deck'].members.find(({ asset }) =>
    face.artwork?.front?.includes(`/spice-cards/${asset.id}/`)
  );
  const data = card?.asset.data;
  const territory = data && 'board' in data ? data.board?.tints[0]?.territories[0] : undefined;
  return data && 'amount' in data && typeof data.amount === 'number' && data.amount > 0 && territory
    ? { name: card.asset.name, amount: data.amount, territory }
    : undefined;
}

export function territory(snapshot: GameSnapshot, piece: Pick<Piece, 'position'>): string | undefined {
  const found = boardTerritoryAt(snapshot.board?.definition ?? retainedArrakisBoard(), [
    CENTER[0] + (piece.position[0] * RADIUS) / BOARD_RADIUS,
    CENTER[1] + (piece.position[2] * RADIUS) / BOARD_RADIUS,
  ]);
  return found && propertyId(found);
}
