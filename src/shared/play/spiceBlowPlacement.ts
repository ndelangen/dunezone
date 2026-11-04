import type { TablePiece, TableState, TableItem, Vector3Tuple } from './model';
import { nearestZone } from './model';
import { GameRejection } from './rejection';
import { createSpiceStack } from './spiceBank';
import type { SpiceBlow } from './spiceBlow';
import { BOARD_RADIUS, planarDistance, restingPositionAt } from './tableGeometry';
import { nearestCollisionFreePosition } from './tablePhysics';
import { accepted } from './tableState';

export type SpiceBlowPlacement = Readonly<{
  pieceId: string;
  territory: string;
  /** The territory's name as the page's board shows it; only the log reads it. */
  name: string;
  position: Vector3Tuple;
}>;

/** The face-up card on top of a piece, when it is a spice card that names where its spice goes. */
export function revealedSpiceBlow(
  piece: Pick<TablePiece, 'kind' | 'items' | 'inventory' | 'battleOverlay'> | null | undefined
): { item: TableItem; blow: SpiceBlow } | null {
  const item = piece?.kind === 'card' && !piece.inventory && !piece.battleOverlay ? piece.items.at(-1) : undefined;
  const artwork = item?.faceUp ? item.artwork : undefined;
  const blow = artwork && 'spiceBlow' in artwork ? artwork.spiceBlow : undefined;
  return item && blow ? { item, blow } : null;
}

/**
 * The territories revealed spice cards on the table still wait to fill this turn, each card once.
 * The table lights them during Spice Blow, so nobody has to go back to the card to see where its spice goes.
 */
export function pendingSpiceBlows(
  pieces: readonly TablePiece[],
  turn: number
): { pieceId: string; territories: string[] }[] {
  return pieces.flatMap((piece) =>
    canPlaceSpiceBlow(piece, turn)
      ? [{ pieceId: piece.id, territories: revealedSpiceBlow(piece)!.blow.territories }]
      : []
  );
}

/** Whether the revealed spice card on top of this piece may still place its spice this turn. */
export function canPlaceSpiceBlow(piece: Parameters<typeof revealedSpiceBlow>[0], turn: number): boolean {
  const revealed = revealedSpiceBlow(piece);
  return !!revealed && revealed.item.spiceBlownTurn !== turn;
}

/*
 * The card's spice, set down as one stack where the page found room in the territory.
 * The table holds no territory shapes, so the page names the spot and the territory; the card decides how much and which territories it may be.
 */
export function placeSpiceBlowInState(
  state: TableState,
  piece: TablePiece,
  placement: SpiceBlowPlacement,
  turn: number,
  actorName = 'A player'
): TableState {
  const revealed = revealedSpiceBlow(piece);
  if (!revealed) {
    throw new GameRejection('Reveal a spice card on the table to place its spice.');
  }
  const { item, blow } = revealed;
  if (item.spiceBlownTurn === turn) {
    throw new GameRejection('This spice card already placed its spice this turn.');
  }
  if (!blow.territories.includes(placement.territory)) {
    throw new GameRejection('This spice card places its spice in another territory.');
  }
  if (planarDistance(placement.position, [0, 0, 0]) > BOARD_RADIUS) {
    throw new GameRejection('Spice from a spice card lands on the board.');
  }
  const stack = createSpiceStack(state.nextEventNumber, 1);
  const spice: TablePiece = {
    ...stack,
    items: Array.from({ length: blow.amount }, (_, index) => ({
      id: `spice-${state.nextEventNumber}-${index + 1}`,
      faceUp: true,
    })),
  };
  const requested = restingPositionAt([placement.position[0], 0, placement.position[2]], spice);
  const position = nearestCollisionFreePosition(spice, requested, state.pieces);
  if (!position) {
    throw new GameRejection(`Make room in ${placement.name} for the spice.`);
  }
  const placed = { ...spice, position, zoneId: nearestZone(position)?.id ?? null };
  const pieces = state.pieces.map((candidate) =>
    candidate.id === piece.id
      ? {
          ...candidate,
          items: candidate.items.map((entry) => (entry === item ? { ...entry, spiceBlownTurn: turn } : entry)),
        }
      : candidate
  );
  return accepted(
    { ...state, pieces: [...pieces, placed], selectedPieceId: placed.id },
    'spice.blow',
    `${actorName} placed ${blow.amount} spice on ${placement.name}.`
  );
}
