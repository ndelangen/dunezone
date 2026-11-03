import type { GameSnapshot } from '@shared/play/protocol';
import { expect, test } from 'vite-plus/test';

import type { TablePlayers } from './chapterScript';
import type { Piece } from './guideChecks';
import { yourHandAndSpice } from './yourHandAndSpice';

const view = { camera: null };
const card = (id: string, type = 'card-treachery') =>
  ({
    id,
    stackKey: 'deck:treachery',
    position: [-1, 0, 1],
    items: [{ id, faceUp: false, artwork: { type } }],
  }) as Piece;

function exercise() {
  const treachery = { ...card('treachery'), position: [-1, 0, 0] } as Piece;
  const spice = { ...card('spice', 'card-spice'), stackKey: 'deck:spice', position: [1, 0, 0] } as Piece;
  const snapshot = { table: { pieces: [treachery, spice] }, hand: [], handOrder: [] } as unknown as GameSnapshot;
  const tasks = yourHandAndSpice.tasks(() => snapshot, {} as TablePlayers);
  return { snapshot, task: (id: string) => tasks.find((task) => task.id === id)! };
}

test('drawing requires four new Treachery cards and points to the left deck', () => {
  const { snapshot, task } = exercise();
  const draw = task('draw');
  const start = draw.begin(view);
  expect(draw.anchor.kind).toBe('table');
  if (draw.anchor.kind === 'table') {
    expect(draw.anchor.point()).toEqual([-1, 0, 0]);
  }
  snapshot.hand = [card('spice', 'card-spice'), card('a'), card('b'), card('c')];
  expect(draw.done(start as never, view)).toBe(false);
  snapshot.hand.push(card('d'));
  expect(draw.done(start as never, view)).toBe(true);
});

test('sorting leaders does not complete the Treachery card reorder task', () => {
  const { snapshot, task } = exercise();
  snapshot.hand = [card('a'), card('b'), card('c'), card('d'), card('leader-1', 'leader'), card('leader-2', 'leader')];
  const reorder = task('reorder');
  const start = reorder.begin(view);
  snapshot.handOrder = ['leader-2', 'leader-1'];
  expect(reorder.done(start as never, view)).toBe(false);
  snapshot.hand = snapshot.hand.filter((piece) => piece.id !== 'd');
  expect(reorder.done(start as never, view)).toBe(false);
  snapshot.hand.push(card('e'));
  expect(reorder.done(start as never, view)).toBe(false);
  snapshot.handOrder = ['b', 'a', 'c', 'e', 'leader-2', 'leader-1'];
  expect(reorder.done(start as never, view)).toBe(true);
});

test('playing follows the new public card through its face-down drop and reveal', () => {
  const { snapshot, task } = exercise();
  snapshot.hand = [card('private-a'), card('private-b')];
  const play = task('play');
  const start = play.begin(view);
  expect(play.done(start as never, view)).toBe(false);
  snapshot.hand.pop();
  expect(play.done(start as never, view)).toBe(false);
  const publicCard = card('public-b');
  snapshot.table.pieces.push(publicCard);
  expect(play.done(start as never, view)).toBe(true);
  const reveal = task('reveal');
  const revealStart = reveal.begin(view);
  expect(reveal.done(revealStart as never, view)).toBe(false);
  if (reveal.anchor.kind === 'table') {
    expect(reveal.anchor.point()).toEqual(publicCard.position);
  }
  publicCard.items[0]!.faceUp = true;
  expect(reveal.done(revealStart as never, view)).toBe(true);
});

test('revealing follows a card that went back through the hand and came out under a new handle', () => {
  const { snapshot, task } = exercise();
  snapshot.hand = [card('private-a'), card('private-b')];
  const play = task('play');
  const start = play.begin(view);
  snapshot.hand.pop();
  const first = card('public-b');
  snapshot.table.pieces.push(first);
  expect(play.done(start as never, view)).toBe(true);
  const reveal = task('reveal');
  const revealStart = reveal.begin(view);
  /* Taken back into the hand, then played in front of the player again: the room gives it a new handle. */
  snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece !== first);
  const again = { ...card('public-b-again'), position: [2, 0, 2] } as Piece;
  snapshot.table.pieces.push(again);
  expect(reveal.done(revealStart as never, view)).toBe(false);
  if (reveal.anchor.kind === 'table') {
    expect(reveal.anchor.point()).toEqual(again.position);
  }
  again.items[0]!.faceUp = true;
  expect(reveal.done(revealStart as never, view)).toBe(true);
});

test('only cards played and revealed during their own tasks count, and turning the decks over does not', () => {
  const { snapshot, task } = exercise();
  snapshot.hand = [card('private-a'), card('private-b'), card('private-c')];
  /* Played and revealed before its task: neither task may tick off from it. */
  snapshot.hand.pop();
  const early = card('public-early');
  early.items[0]!.faceUp = true;
  snapshot.table.pieces.push(early);
  const play = task('play');
  const start = play.begin(view);
  /* Set on the side-table, or dropped on a deck: the hand shrinks, but no card lands. */
  snapshot.hand.pop();
  expect(play.done(start as never, view)).toBe(false);
  snapshot.hand.pop();
  const later = card('public-later');
  snapshot.table.pieces.push(later);
  expect(play.done(start as never, view)).toBe(true);
  const reveal = task('reveal');
  const revealStart = reveal.begin(view);
  expect(reveal.done(revealStart as never, view)).toBe(false);
  for (const deck of snapshot.table.pieces.filter((piece) => piece !== early && piece !== later)) {
    deck.items[0]!.faceUp = true;
  }
  expect(reveal.done(revealStart as never, view)).toBe(false);
  later.items[0]!.faceUp = true;
  expect(reveal.done(revealStart as never, view)).toBe(true);
});

test('with no Treachery deck on the left, nothing counts as a played card', () => {
  const { snapshot, task } = exercise();
  snapshot.table.pieces[0] = { ...snapshot.table.pieces[0]!, position: [1, 0, 1] } as Piece;
  snapshot.hand = [card('private-a')];
  const play = task('play');
  const start = play.begin(view);
  snapshot.hand.pop();
  snapshot.table.pieces.push({ ...card('token'), stackKey: undefined } as unknown as Piece);
  expect(play.done(start as never, view)).toBe(false);
});
