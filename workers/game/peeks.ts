import { accepted, nextSnapshot } from '../../src/shared/play/commands';
import { rosterFactionEventName } from '../../src/shared/play/factionLabels';
import type { StoredPiece } from '../../src/shared/play/model';
import { nearestZone } from '../../src/shared/play/model';
import { hasHiddenFace, peeksWholeDeck } from '../../src/shared/play/peeking';
import type { PeekAction } from '../../src/shared/play/peeking';
import { rosterFactionNames, tableForViewer } from '../../src/shared/play/protocol';
import { GameRejection } from '../../src/shared/play/rejection';
import { SPECTATOR_SEAT } from '../../src/shared/play/schema';
import { restingPositionAt } from '../../src/shared/play/tableGeometry';
import { nearestCollisionFreePosition } from '../../src/shared/play/tablePhysics';
import { labelForCount } from '../../src/shared/play/tableState';
import { concealCards } from './decks';
import { openPeek } from './state';
import type { StoredSnapshot } from './state';

/* Who is peeking, at which table: every transition here acts for one faction on one stored snapshot. */
type Peeker = Readonly<{ snapshot: StoredSnapshot; factionId: string }>;
type StoredItem = StoredPiece['items'][number];

function liesOnTable(piece: StoredPiece | undefined): piece is StoredPiece {
  return !!piece && !piece.inventory && piece.items.length > 0;
}

function requirePeekable({ snapshot }: Peeker, pieceId: string): StoredPiece {
  const piece = snapshot.table.pieces.find((candidate) => candidate.id === pieceId);
  if (!liesOnTable(piece)) {
    throw new GameRejection('Choose a card, token or deck on the table.');
  }
  /* A battle plan's cards stay hidden until the battle reveals them. */
  if (piece.battleOverlay) {
    throw new GameRejection('Battle plans stay hidden until the battle reveals them.');
  }
  return piece;
}

function holdsDeckOpen(peeker: Peeker, deck: StoredPiece) {
  return peeksWholeDeck(deck) && openPeek(peeker.snapshot, peeker.factionId, deck.id) !== undefined;
}

/* The deck the faction holds open: an arrangement or a pull acts only on what its peeker can see. */
function requireOpenDeck(peeker: Peeker, pieceId: string): StoredPiece {
  const deck = requirePeekable(peeker, pieceId);
  if (!holdsDeckOpen(peeker, deck)) {
    throw new GameRejection('Peek at the deck before changing it.');
  }
  /* A locked deck can be looked through, but not rearranged or drawn from, as a draw or a shuffle cannot. */
  if (deck.locked) {
    throw new GameRejection('Unlock the deck before changing it.');
  }
  return deck;
}

function withPeeker(item: StoredItem, factionId: string): StoredItem {
  return item.peekedBy?.includes(factionId) ? item : { ...item, peekedBy: [...(item.peekedBy ?? []), factionId] };
}

function peekerName({ snapshot, factionId }: Peeker) {
  return rosterFactionEventName(snapshot.roster, factionId);
}

function replacing(snapshot: StoredSnapshot, piece: StoredPiece): StoredPiece[] {
  return snapshot.table.pieces.map((candidate) => (candidate.id === piece.id ? piece : candidate));
}

function commit(
  snapshot: StoredSnapshot,
  pieces: StoredPiece[],
  event: Readonly<{ command: string; message: string }>
) {
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  return nextSnapshot(snapshot, accepted({ ...table, pieces }, event.command, event.message));
}

/* The piece with its peeker named on what the peek shows: every card of a deck, or the top card or token. */
function markPeeked(piece: StoredPiece, factionId: string): StoredPiece {
  const shown = peeksWholeDeck(piece) ? 0 : piece.items.length - 1;
  return {
    ...piece,
    items: piece.items.map((item, index) => (index >= shown ? withPeeker(item, factionId) : item)),
  };
}

function peek(peeker: Peeker, pieceId: string): StoredSnapshot {
  const { snapshot, factionId } = peeker;
  const piece = requirePeekable(peeker, pieceId);
  if (!hasHiddenFace(piece)) {
    throw new GameRejection('Nothing about that piece is hidden.');
  }
  const verb = peeksWholeDeck(piece) ? 'looked through' : 'peeked at';
  const next = commit(snapshot, replacing(snapshot, markPeeked(piece, factionId)), {
    command: 'piece.peek',
    message: `${peekerName(peeker)} ${verb} ${piece.label}.`,
  });
  const handle = next.pieceHandles[piece.id] ?? piece.id;
  return { ...next, peeks: { ...snapshot.peeks, [factionId]: { pieceId: piece.id, handle } } };
}

function close({ snapshot, factionId }: Peeker): StoredSnapshot {
  const { [factionId]: _closed, ...peeks } = snapshot.peeks;
  return { ...nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT)), peeks };
}

/* Whether an order names every card of the deck exactly once. */
function isArrangementOf(order: readonly number[], count: number) {
  const distinct = new Set(order.filter((index) => index < count));
  return order.length === count && distinct.size === count;
}

function arrange(peeker: Peeker, action: Extract<PeekAction, { kind: 'peek-arrange' }>): StoredSnapshot {
  const { snapshot } = peeker;
  const deck = requireOpenDeck(peeker, action.pieceId);
  if (!isArrangementOf(action.order, deck.items.length)) {
    throw new GameRejection('The deck changed. Try arranging it again.');
  }
  const arranged = { ...deck, items: action.order.map((index) => deck.items[index]!) };
  const next = commit(snapshot, replacing(snapshot, arranged), {
    command: 'deck.arrange',
    message: `${peekerName(peeker)} rearranged ${deck.label}.`,
  });
  /* New handles, so nobody else can follow a card to its new place in the deck. */
  return concealCards(next, [arranged]);
}

/* One card out of a deck, face down beside it, placed clear of every other piece. */
function pulledCard(snapshot: StoredSnapshot, deck: StoredPiece, item: StoredItem, others: StoredPiece[]): StoredPiece {
  const card: StoredPiece = {
    ...deck,
    id: `pulled-${snapshot.table.nextEventNumber}`,
    label: labelForCount(deck, 1, rosterFactionNames(snapshot.roster), true),
    items: [{ ...item, faceUp: false }],
    shuffleRevision: undefined,
    flipRevision: undefined,
    position: [deck.position[0] + 1, deck.position[1], deck.position[2] + 0.25],
  };
  const position = nearestCollisionFreePosition(card, card.position, others);
  if (!position) {
    throw new GameRejection(`There is no clear space beside ${deck.label}.`);
  }
  return { ...card, position: restingPositionAt(position, card), zoneId: nearestZone(position)?.id ?? null };
}

/* The deck without one card, named for what is left, or nothing once it is empty. */
function deckWithout(snapshot: StoredSnapshot, deck: StoredPiece, index: number): StoredPiece[] {
  const items = deck.items.filter((_, candidate) => candidate !== index);
  const label = labelForCount(deck, items.length, rosterFactionNames(snapshot.roster));
  return items.length ? [{ ...deck, items, label }] : [];
}

function pull(peeker: Peeker, action: Extract<PeekAction, { kind: 'peek-pull' }>): StoredSnapshot {
  const { snapshot } = peeker;
  const deck = requireOpenDeck(peeker, action.pieceId);
  const item = deck.items[action.index];
  if (!item) {
    throw new GameRejection('The deck changed. Try again.');
  }
  const rest = deckWithout(snapshot, deck, action.index);
  const others = snapshot.table.pieces.flatMap((candidate) => (candidate.id === deck.id ? rest : [candidate]));
  const pulled = pulledCard(snapshot, deck, item, others);
  const next = commit(snapshot, [...others, pulled], {
    command: 'deck.pull',
    message: `${peekerName(peeker)} pulled a card out of ${deck.label}.`,
  });
  /* The deck's handles change too, so where in it the card came from stays with its peeker. */
  return concealCards(next, [...rest, pulled]);
}

/** The room checks the current actor, stage and carry reservations before this transition. */
export function peekCommand(snapshot: StoredSnapshot, factionId: string, action: PeekAction): StoredSnapshot {
  const peeker = { snapshot, factionId };
  switch (action.kind) {
    case 'peek':
      return peek(peeker, action.pieceId);
    case 'peek-close':
      return close(peeker);
    case 'peek-arrange':
      return arrange(peeker, action);
    case 'peek-pull':
      return pull(peeker, action);
  }
}

function withoutPeekers(piece: StoredPiece): StoredPiece {
  return piece.items.some((item) => item.peekedBy)
    ? { ...piece, items: piece.items.map(({ peekedBy: _peekedBy, ...item }) => item) }
    : piece;
}

/** Every card and token, on the table and in hand, forgets who peeked at it; a piece that changes takes the snapshot's revision. */
export function forgetPeekers(snapshot: StoredSnapshot): StoredSnapshot {
  const versions = { ...snapshot.versions };
  const pieces = snapshot.table.pieces.map((piece) => {
    const forgotten = withoutPeekers(piece);
    if (forgotten !== piece) {
      versions[piece.id] = snapshot.revision;
    }
    return forgotten;
  });
  const factionInventories = Object.fromEntries(
    Object.entries(snapshot.factionInventories).map(([id, hand]) => [id, hand.map(withoutPeekers)])
  );
  return { ...snapshot, table: { ...snapshot.table, pieces }, versions, factionInventories };
}
