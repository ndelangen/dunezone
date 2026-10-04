import { expect, test } from 'vitest';

import { PEEK_DECK_LIMIT, peekActionSchema } from '../../src/shared/play/peeking';
import { piece, place } from '../../src/shared/play/setupSupply';
import { deckCommand } from './decks';
import { hostedFixturePlan } from './fixture';
import { closeLostPeeks, forgetPeekers, peekCommand } from './peeks';
import { RoomProjection } from './state';
import type { StoredSnapshot } from './state';

const BACK = 'https://table.test/published/decks/treachery/cardback.jpg';
const front = (index: number) => `https://table.test/published/decks/treachery/${index}.jpg`;

function table(count: number): StoredSnapshot {
  const deck = place(
    {
      ...piece('deck', 'Treachery deck', 'shared', '#d5ba8c', 'card', 'deck:treachery'),
      items: Array.from({ length: count }, (_, index) => ({
        id: `card-${index}`,
        faceUp: false,
        artwork: {
          front: front(index),
          back: BACK,
          backName: 'Treachery',
          name: `Card ${index}`,
          type: 'card-treachery',
        },
      })),
    },
    [6, 0, 6]
  );
  const fixture = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  return { ...fixture, table: { ...fixture.table, pieces: [deck] } };
}

const fronts = (snapshot: ReturnType<RoomProjection['snapshot']>) =>
  JSON.stringify(snapshot).match(/treachery\/\d\.jpg/g) ?? [];

test('a peek shows the faces to the peeker alone, and tells everyone who peeked', () => {
  const projection = new RoomProjection('secret');
  const peeked = peekCommand(table(1), 'atreides', { kind: 'peek', pieceId: 'deck' });

  expect(projection.snapshot(peeked, 'atreides').peek?.piece.items[0]?.artwork).toMatchObject({ front: front(0) });
  for (const viewer of ['harkonnen', undefined]) {
    const seen = projection.snapshot(peeked, viewer);
    expect(seen.peek ?? null).toBeNull();
    expect(fronts(seen)).toEqual([]);
    expect(seen.table.pieces[0]?.items[0]?.peekedBy).toEqual(['atreides']);
  }

  const closed = peekCommand(peeked, 'atreides', { kind: 'peek-close' });
  expect(projection.snapshot(closed, 'atreides').peek).toBeNull();
  expect(closed.table.pieces[0]?.items[0]?.peekedBy).toEqual(['atreides']);
});

test('a peeked deck can be rearranged and have a card pulled out, by its peeker only', () => {
  let snapshot = table(3);
  expect(() => peekCommand(snapshot, 'atreides', { kind: 'peek-arrange', pieceId: 'deck', order: [2, 1, 0] })).toThrow(
    'Peek at the deck before changing it.'
  );

  snapshot = peekCommand(snapshot, 'atreides', { kind: 'peek', pieceId: 'deck' });
  const deck = () => snapshot.table.pieces.find((candidate) => candidate.id === 'deck')!;
  expect(deck().items.every((item) => item.peekedBy?.includes('atreides'))).toBe(true);

  expect(() => peekCommand(snapshot, 'harkonnen', { kind: 'peek-arrange', pieceId: 'deck', order: [2, 1, 0] })).toThrow(
    'Peek at the deck before changing it.'
  );
  expect(() =>
    peekCommand(snapshot, 'atreides', { kind: 'peek-arrange', pieceId: 'deck', order: [0, 0, 1] })
  ).toThrow();

  const handles = snapshot.cardHandles;
  snapshot = peekCommand(snapshot, 'atreides', { kind: 'peek-arrange', pieceId: 'deck', order: [2, 0, 1] });
  expect(deck().items.map((item) => item.id)).toEqual(['card-2', 'card-0', 'card-1']);
  expect(snapshot.cardHandles['card-0']).not.toBe(handles['card-0']);

  snapshot = peekCommand(snapshot, 'atreides', { kind: 'peek-pull', pieceId: 'deck', index: 1 });
  expect(deck().items.map((item) => item.id)).toEqual(['card-2', 'card-1']);
  const pulled = snapshot.table.pieces.find((candidate) => candidate.id !== 'deck')!;
  expect(pulled.items).toMatchObject([{ id: 'card-0', faceUp: false }]);
  expect(pulled.position).not.toEqual(deck().position);
});

test('a battle plan cannot be peeked at, and a face-up card has nothing to peek at', () => {
  const snapshot = table(1);
  const [deck] = snapshot.table.pieces;
  const inBattle = { ...snapshot, table: { ...snapshot.table, pieces: [{ ...deck!, battleOverlay: 'battle-1' }] } };
  expect(() => peekCommand(inBattle, 'atreides', { kind: 'peek', pieceId: 'deck' })).toThrow(
    'Battle plans stay hidden'
  );
  const faceUp = {
    ...snapshot,
    table: { ...snapshot.table, pieces: [{ ...deck!, items: deck!.items.map((item) => ({ ...item, faceUp: true })) }] },
  };
  expect(() => peekCommand(faceUp, 'atreides', { kind: 'peek', pieceId: 'deck' })).toThrow('Nothing about');
});

test('a new phase forgets who peeked, closes every peek, and changes the pieces it clears', () => {
  const peeked = peekCommand(table(2), 'atreides', { kind: 'peek', pieceId: 'deck' });
  const forgotten = forgetPeekers({ ...peeked, revision: peeked.revision + 1 });
  expect(forgotten.table.pieces[0]?.items.some((item) => item.peekedBy)).toBe(false);
  expect(forgotten.versions.deck).toBe(peeked.revision + 1);
  expect(forgotten.peeks).toEqual({});
});

test('a locked deck can be looked through but not rearranged or pulled from', () => {
  const snapshot = table(3);
  const locked = {
    ...snapshot,
    table: { ...snapshot.table, pieces: snapshot.table.pieces.map((piece) => ({ ...piece, locked: true })) },
  };
  const peeked = peekCommand(locked, 'atreides', { kind: 'peek', pieceId: 'deck' });
  expect(new RoomProjection('secret').snapshot(peeked, 'atreides').peek?.piece.items).toHaveLength(3);
  expect(() => peekCommand(peeked, 'atreides', { kind: 'peek-arrange', pieceId: 'deck', order: [2, 1, 0] })).toThrow(
    'Unlock the deck'
  );
  expect(() => peekCommand(peeked, 'atreides', { kind: 'peek-pull', pieceId: 'deck', index: 0 })).toThrow(
    'Unlock the deck'
  );
});

test('a peek does not follow a card through a hand back onto the table', () => {
  const projection = new RoomProjection('secret');
  const peeked = peekCommand(table(1), 'atreides', { kind: 'peek', pieceId: 'deck' });
  /* The card went into a hand and was played back face down under the same stored id, with a new public handle. */
  const returned = { ...peeked, pieceHandles: { ...peeked.pieceHandles, deck: 'new-handle' } };
  expect(projection.snapshot(returned, 'atreides').peek).toBeNull();
  expect(() => peekCommand(returned, 'atreides', { kind: 'peek-arrange', pieceId: 'deck', order: [0, 1] })).toThrow();
});

test('a shuffle closes the peek at the deck: its faces go with the public mark', () => {
  const projection = new RoomProjection('secret');
  const peeked = peekCommand(table(3), 'atreides', { kind: 'peek', pieceId: 'deck' });
  expect(closeLostPeeks(peeked).peeks).toEqual(peeked.peeks);

  const shuffled = deckCommand(peeked, 'harkonnen', { kind: 'deck-shuffle', pieceId: 'deck' });
  /* Even before the room tidies the stored peek away, the projection shows no faces without the mark. */
  expect(projection.snapshot(shuffled, 'atreides').peek).toBeNull();
  expect(closeLostPeeks(shuffled).peeks).toEqual({});
});

test('a deck over the limit can be looked through, but not rearranged or pulled from', () => {
  const peeked = peekCommand(table(PEEK_DECK_LIMIT + 1), 'atreides', { kind: 'peek', pieceId: 'deck' });
  expect(new RoomProjection('secret').snapshot(peeked, 'atreides').peek?.piece.items).toHaveLength(PEEK_DECK_LIMIT + 1);
  expect(() => peekCommand(peeked, 'atreides', { kind: 'peek-pull', pieceId: 'deck', index: 0 })).toThrow(
    'can only be looked through'
  );
  expect(peekActionSchema.safeParse({ kind: 'peek-pull', pieceId: 'deck', index: PEEK_DECK_LIMIT - 1 }).success).toBe(
    true
  );
  expect(peekActionSchema.safeParse({ kind: 'peek-pull', pieceId: 'deck', index: PEEK_DECK_LIMIT }).success).toBe(
    false
  );
});
