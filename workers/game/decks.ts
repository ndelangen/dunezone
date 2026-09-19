import { randomInt, randomUUID } from 'node:crypto';

import { nextSnapshot } from '../../src/shared/play/commands';
import type { TablePiece } from '../../src/shared/play/model';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { PieceAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { appendEvent, eventId } from '../../src/shared/play/tableState';
import type { StoredSnapshot } from './state';

type DeckAction = Extract<PieceAction, { kind: 'deck-draw' | 'deck-shuffle' }>;

/** Keep physical card identities and history intact while retiring their observable handles. */
export function concealCards(snapshot: StoredSnapshot, pieces: TablePiece[], retirePieces = false): StoredSnapshot {
  const cardHandles = { ...snapshot.cardHandles };
  const pieceHandles = { ...snapshot.pieceHandles };
  for (const piece of pieces) {
    if (piece.kind === 'card') {
      if (retirePieces) {
        pieceHandles[piece.id] = randomUUID();
      }
      for (const item of piece.items) {
        cardHandles[item.id] = randomUUID();
      }
    }
  }
  return { ...snapshot, cardHandles, pieceHandles };
}

/** The room checks the current actor, stage and carry reservations before this transition. */
export function deckCommand(snapshot: StoredSnapshot, factionId: string, action: DeckAction): StoredSnapshot {
  const deck = snapshot.table.pieces.find((piece) => piece.id === action.pieceId);
  if (!deck || deck.kind !== 'card' || deck.locked || deck.inventory || !deck.items.length) {
    throw new GameRejection('Choose an unlocked deck on the table.');
  }
  let pieces: TablePiece[];
  let inventories = snapshot.factionInventories;
  let message: string;
  let concealed: TablePiece[];
  if (action.kind === 'deck-shuffle') {
    if (deck.items.length < 2) {
      throw new GameRejection('A shuffle needs at least two cards.');
    }
    const items = deck.items.map((item) => ({ ...item, faceUp: false }));
    for (let index = items.length - 1; index > 0; index--) {
      const other = randomInt(index + 1);
      [items[index], items[other]] = [items[other], items[index]];
    }
    const shuffled = { ...deck, items, shuffleRevision: snapshot.revision + 1 };
    pieces = snapshot.table.pieces.map((piece) => (piece.id === deck.id ? shuffled : piece));
    concealed = [shuffled];
    message = 'The deck was shuffled.';
  } else {
    const recipient = action.recipient ?? factionId;
    const seat = snapshot.roster?.seats.find((seat) => seat.faction?.id === recipient);
    if (!seat) {
      throw new GameRejection('That faction has no seat at this table.');
    }
    const item = deck.items.at(-1)!;
    const drawn = {
      ...deck,
      id: randomUUID(),
      label: 'Card',
      owner: recipient,
      items: [{ ...item, faceUp: false }],
      shuffleRevision: undefined,
      battleOverlay: undefined,
    };
    pieces = snapshot.table.pieces.flatMap((piece) =>
      piece.id !== deck.id ? [piece] : deck.items.length > 1 ? [{ ...deck, items: deck.items.slice(0, -1) }] : []
    );
    inventories = { ...inventories, [recipient]: [...(inventories[recipient] ?? []), drawn] };
    concealed = [drawn];
    message = `One card was dealt to ${seat.faction!.name}.`;
  }
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  const next = nextSnapshot(snapshot, {
    ...table,
    pieces,
    ...appendEvent(table, { id: eventId(table.nextEventNumber), command: action.kind, message, status: 'accepted' }),
  });
  return concealCards({ ...next, factionInventories: inventories }, concealed);
}
