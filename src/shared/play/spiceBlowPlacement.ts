import type { TableItem, TablePiece, TableState, Vector3Tuple } from './model';
import { nearestZone } from './model';
import { GameRejection } from './rejection';
import { isSpicePiece } from './spice';
import { createSpiceStack } from './spiceBank';
import type { SpiceBlow } from './spiceBlow';
import { BOARD_RADIUS, planarDistance, restingPositionAt } from './tableGeometry';
import { isCollisionFreePosition } from './tablePhysics';
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
 * The revealed spice cards on the table and the territories each names.
 * The table lights those territories during Spice Blow, so nobody has to go back to the card to see where its spice goes.
 */
export function revealedSpiceBlows(pieces: readonly TablePiece[]): { pieceId: string; blow: SpiceBlow }[] {
  return pieces.flatMap((piece) => {
    const revealed = revealedSpiceBlow(piece);
    return revealed ? [{ pieceId: piece.id, blow: revealed.blow }] : [];
  });
}

/* Spice already lying on the requested spot, which the card's spice joins. */
function spiceAtSpot(state: TableState, position: Vector3Tuple) {
  return state.pieces.find(
    (candidate) => isSpicePiece(candidate) && !candidate.locked && planarDistance(candidate.position, position) < 1e-6
  );
}

/*
 * The card's spice, added to the spice the page found in the territory, or set down as one stack exactly where the page found room in it.
 * A card may place its spice as often as the table asks, since a ruleset can blow the same card more than once.
 * The table holds no territory shapes, so the page names the spot and the territory; the card decides how much and which territories it may be.
 */
export function placeSpiceBlowInState(
  state: TableState,
  piece: TablePiece,
  placement: SpiceBlowPlacement,
  actorName = 'A player'
): TableState {
  const revealed = revealedSpiceBlow(piece);
  if (!revealed) {
    throw new GameRejection('Reveal a spice card on the table to place its spice.');
  }
  const { blow } = revealed;
  if (!blow.territories.includes(placement.territory)) {
    throw new GameRejection('This spice card places its spice in another territory.');
  }
  if (planarDistance(placement.position, [0, 0, 0]) > BOARD_RADIUS) {
    throw new GameRejection('Spice from a spice card lands on the board.');
  }
  const items = Array.from({ length: blow.amount }, (_, index) => ({
    id: `spice-${state.nextEventNumber}-${index + 1}`,
    faceUp: true,
  }));
  const message = `${actorName} placed ${blow.amount} spice on ${placement.name}.`;
  const existing = spiceAtSpot(state, placement.position);
  if (existing) {
    const pieces = state.pieces.map((candidate) =>
      candidate === existing ? { ...existing, items: [...existing.items, ...items] } : candidate
    );
    return accepted({ ...state, pieces, selectedPieceId: existing.id }, 'spice.blow', message);
  }
  const spice: TablePiece = { ...createSpiceStack(state.nextEventNumber, 1), items };
  const position = restingPositionAt([placement.position[0], 0, placement.position[2]], spice);
  /* The table cannot tell where the territory ends, so it never moves the spice off the page's spot: a spot taken since is refused, and placing again finds a new one. */
  if (!isCollisionFreePosition(spice, position, state.pieces)) {
    throw new GameRejection(`Something moved onto the spot in ${placement.name}; place the spice again.`);
  }
  const placed = { ...spice, position, zoneId: nearestZone(position)?.id ?? null };
  return accepted({ ...state, pieces: [...state.pieces, placed], selectedPieceId: placed.id }, 'spice.blow', message);
}
