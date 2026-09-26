import { randomInt, randomUUID } from 'node:crypto';

import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import type { TablePiece } from '../../src/shared/play/model';
import { tableForViewer } from '../../src/shared/play/protocol';
import type { DeckAction } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import type { StoredSnapshot } from './state';

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

type DeckTransition = {
  pieces: TablePiece[];
  inventories: StoredSnapshot['factionInventories'];
  concealed: TablePiece[];
  message: string;
};

/** Initial supply and later shuffles both sever the public catalogue order. */
export function shuffledCards(source: TablePiece['items']): TablePiece['items'] {
  const items = source.map((item) => ({ ...item, faceUp: false }));
  for (let index = items.length - 1; index > 0; index--) {
    const other = randomInt(index + 1);
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function shuffleDeck(snapshot: StoredSnapshot, deck: TablePiece): DeckTransition {
  if (deck.items.length < 2) {
    throw new GameRejection('A shuffle needs at least two cards.');
  }
  const items = shuffledCards(deck.items);
  const shuffled = { ...deck, items, battleOverlay: undefined, shuffleRevision: snapshot.revision + 1 };
  return {
    pieces: snapshot.table.pieces.map((piece) => (piece.id === deck.id ? shuffled : piece)),
    inventories: snapshot.factionInventories,
    concealed: [shuffled],
    message: 'The deck was shuffled.',
  };
}

function drawCard(snapshot: StoredSnapshot, deck: TablePiece, recipient: string): DeckTransition {
  const faction = snapshot.roster?.seats.find((seat) => seat.faction?.id === recipient)?.faction;
  if (!faction) {
    throw new GameRejection('That faction has no seat at this table.');
  }
  const drawn = {
    ...deck,
    id: randomUUID(),
    label: 'Card',
    owner: recipient,
    items: [{ ...deck.items.at(-1)!, faceUp: false }],
    shuffleRevision: undefined,
    battleOverlay: undefined,
  };
  const remaining = deck.items.slice(0, -1);
  return {
    pieces: snapshot.table.pieces.flatMap((piece) => {
      if (piece.id !== deck.id) {
        return [piece];
      }
      return remaining.length ? [{ ...deck, items: remaining }] : [];
    }),
    inventories: {
      ...snapshot.factionInventories,
      [recipient]: [...(snapshot.factionInventories[recipient] ?? []), drawn],
    },
    concealed: [drawn],
    message: `One card was dealt to ${faction.name}.`,
  };
}

function requireDeck(snapshot: StoredSnapshot, pieceId: string): TablePiece {
  const deck = snapshot.table.pieces.find((piece) => piece.id === pieceId);
  if (!deck || deck.kind !== 'card') {
    throw new GameRejection('Choose a deck on the table.');
  }
  if (deck.locked || deck.inventory) {
    throw new GameRejection('Choose an unlocked deck on the table.');
  }
  return deck;
}

/** The room checks the current actor, stage and carry reservations before this transition. */
export function deckCommand(snapshot: StoredSnapshot, factionId: string, action: DeckAction): StoredSnapshot {
  const deck = requireDeck(snapshot, action.pieceId);
  if (!deck.items.length) {
    throw new GameRejection('That deck is empty.');
  }
  const transition =
    action.kind === 'deck-shuffle'
      ? shuffleDeck(snapshot, deck)
      : drawCard(snapshot, deck, action.recipient ?? factionId);
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  const next = nextSnapshot(
    snapshot,
    accepted({ ...table, pieces: transition.pieces }, action.kind, transition.message)
  );
  return concealCards({ ...next, factionInventories: transition.inventories }, transition.concealed);
}
