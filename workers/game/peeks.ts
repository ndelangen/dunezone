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

function requirePeekable(snapshot: StoredSnapshot, pieceId: string): StoredPiece {
  const piece = snapshot.table.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece || piece.inventory || !piece.items.length) {
    throw new GameRejection('Choose a card, token or deck on the table.');
  }
  /* A battle plan's cards stay hidden until the battle reveals them. */
  if (piece.battleOverlay) {
    throw new GameRejection('Battle plans stay hidden until the battle reveals them.');
  }
  return piece;
}

/* The deck the faction holds open: an arrangement or a pull acts only on what its peeker can see. */
function requireOpenDeck(snapshot: StoredSnapshot, factionId: string, pieceId: string): StoredPiece {
  const piece = requirePeekable(snapshot, pieceId);
  if (!openPeek(snapshot, factionId, piece.id) || !peeksWholeDeck(piece)) {
    throw new GameRejection('Peek at the deck before changing it.');
  }
  /* A locked deck can be looked through, but not rearranged or drawn from, as a draw or a shuffle cannot. */
  if (piece.locked) {
    throw new GameRejection('Unlock the deck before changing it.');
  }
  return piece;
}

function withPeeker(item: StoredPiece['items'][number], factionId: string) {
  return item.peekedBy?.includes(factionId) ? item : { ...item, peekedBy: [...(item.peekedBy ?? []), factionId] };
}

function commit(snapshot: StoredSnapshot, pieces: StoredPiece[], command: string, message: string) {
  const table = tableForViewer(snapshot, SPECTATOR_SEAT);
  return nextSnapshot(snapshot, accepted({ ...table, pieces }, command, message));
}

function peek(snapshot: StoredSnapshot, factionId: string, pieceId: string): StoredSnapshot {
  const piece = requirePeekable(snapshot, pieceId);
  if (!hasHiddenFace(piece)) {
    throw new GameRejection('Nothing about that piece is hidden.');
  }
  const whole = peeksWholeDeck(piece);
  const peeked = {
    ...piece,
    items: piece.items.map((item, index) =>
      whole || index === piece.items.length - 1 ? withPeeker(item, factionId) : item
    ),
  };
  const name = rosterFactionEventName(snapshot.roster, factionId);
  const next = commit(
    snapshot,
    snapshot.table.pieces.map((candidate) => (candidate.id === piece.id ? peeked : candidate)),
    'piece.peek',
    whole ? `${name} looked through ${piece.label}.` : `${name} peeked at ${piece.label}.`
  );
  const handle = next.pieceHandles[piece.id] ?? piece.id;
  return { ...next, peeks: { ...snapshot.peeks, [factionId]: { pieceId: piece.id, handle } } };
}

function close(snapshot: StoredSnapshot, factionId: string): StoredSnapshot {
  const { [factionId]: _closed, ...peeks } = snapshot.peeks;
  return { ...nextSnapshot(snapshot, tableForViewer(snapshot, SPECTATOR_SEAT)), peeks };
}

function arrange(snapshot: StoredSnapshot, factionId: string, pieceId: string, order: number[]): StoredSnapshot {
  const deck = requireOpenDeck(snapshot, factionId, pieceId);
  const indices = new Set(order);
  if (
    order.length !== deck.items.length ||
    indices.size !== order.length ||
    order.some((index) => !deck.items[index])
  ) {
    throw new GameRejection('The deck changed. Try arranging it again.');
  }
  const arranged = { ...deck, items: order.map((index) => deck.items[index]!) };
  const next = commit(
    snapshot,
    snapshot.table.pieces.map((candidate) => (candidate.id === deck.id ? arranged : candidate)),
    'deck.arrange',
    `${rosterFactionEventName(snapshot.roster, factionId)} rearranged ${deck.label}.`
  );
  /* New handles, so nobody else can follow a card to its new place in the deck. */
  return concealCards(next, [arranged]);
}

function pull(snapshot: StoredSnapshot, factionId: string, pieceId: string, index: number): StoredSnapshot {
  const deck = requireOpenDeck(snapshot, factionId, pieceId);
  const item = deck.items[index];
  if (!item) {
    throw new GameRejection('The deck changed. Try again.');
  }
  const names = rosterFactionNames(snapshot.roster);
  const remaining = deck.items.filter((_, candidate) => candidate !== index);
  const rest = { ...deck, items: remaining, label: labelForCount(deck, remaining.length, names) };
  const pulled: StoredPiece = {
    ...deck,
    id: `pulled-${snapshot.table.nextEventNumber}`,
    label: labelForCount(deck, 1, names, true),
    items: [{ ...item, faceUp: false }],
    shuffleRevision: undefined,
    flipRevision: undefined,
    position: [deck.position[0] + 1, deck.position[1], deck.position[2] + 0.25],
  };
  const others = snapshot.table.pieces.flatMap((candidate) =>
    candidate.id !== deck.id ? [candidate] : remaining.length ? [rest] : []
  );
  const position = nearestCollisionFreePosition(pulled, pulled.position, others);
  if (!position) {
    throw new GameRejection(`There is no clear space beside ${deck.label}.`);
  }
  pulled.position = restingPositionAt(position, pulled);
  pulled.zoneId = nearestZone(position)?.id ?? null;
  const next = commit(
    snapshot,
    [...others, pulled],
    'deck.pull',
    `${rosterFactionEventName(snapshot.roster, factionId)} pulled a card out of ${deck.label}.`
  );
  /* The deck's handles change too, so where in it the card came from stays with its peeker. */
  return concealCards(next, remaining.length ? [rest, pulled] : [pulled]);
}

/** The room checks the current actor, stage and carry reservations before this transition. */
export function peekCommand(snapshot: StoredSnapshot, factionId: string, action: PeekAction): StoredSnapshot {
  switch (action.kind) {
    case 'peek':
      return peek(snapshot, factionId, action.pieceId);
    case 'peek-close':
      return close(snapshot, factionId);
    case 'peek-arrange':
      return arrange(snapshot, factionId, action.pieceId, action.order);
    case 'peek-pull':
      return pull(snapshot, factionId, action.pieceId, action.index);
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
