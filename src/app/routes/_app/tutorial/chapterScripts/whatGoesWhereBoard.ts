import { CENTER, RADIUS, retainedArrakisBoard } from '@shared/boards/geometry';
import { propertyId } from '@shared/boards/schema';
import { boardTerritoryAt } from '@shared/boards/territories';
import type { GameSnapshot } from '@shared/play/protocol';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';

import spiceBlows from '../setup/spiceBlows.json';
import type { Piece } from './guideChecks';

/* Loaded only while this chapter runs: the recorded card lookup supplies its printed amount and board territory. */
export type SpiceBlow = Readonly<{ name: string; amount: number; territory: string }>;

function revealedSpiceFront(piece: Piece): string | undefined {
  if (piece.items.length !== 1) {
    return undefined;
  }
  const face = piece.items[0];
  if (!face?.faceUp) {
    return undefined;
  }
  if (face.artwork?.type !== 'card-spice') {
    return undefined;
  }
  return face.artwork.front;
}

export function spiceBlow(piece: Piece): SpiceBlow | undefined {
  const front = revealedSpiceFront(piece);
  if (!front) {
    return undefined;
  }
  const card = spiceBlows.find(({ assetId }) => front.includes(`/spice-cards/${assetId}/`));
  if (!card) {
    return undefined;
  }
  return { name: card.name, amount: card.amount, territory: card.territory };
}

export function territory(snapshot: GameSnapshot, piece: Pick<Piece, 'position'>): string | undefined {
  const found = boardTerritoryAt(snapshot.board?.definition ?? retainedArrakisBoard(), [
    CENTER[0] + (piece.position[0] * RADIUS) / BOARD_RADIUS,
    CENTER[1] + (piece.position[2] * RADIUS) / BOARD_RADIUS,
  ]);
  return found && propertyId(found);
}
