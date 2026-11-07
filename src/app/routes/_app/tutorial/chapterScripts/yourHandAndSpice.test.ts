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
  const task = (id: string) => tasks.find((task) => task.id === id)!;
  /* A task begun now, asked whether it is done. */
  const begin = (id: string) => {
    const started = task(id);
    const start = started.begin(view);
    return () => started.done(start as never, view);
  };
  /* A card leaves the hand and lands on the table under a new public handle. */
  const play = (id: string, faceUp = false) => {
    snapshot.hand!.pop();
    const played = card(id);
    played.items[0]!.faceUp = faceUp;
    snapshot.table.pieces.push(played);
    return played;
  };
  return { snapshot, task, begin, play };
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
  const { snapshot, task, begin, play } = exercise();
  snapshot.hand = [card('private-a'), card('private-b'), card('private-c')];
  const played = begin('play');
  const first = play('public-b');
  expect(played()).toBe(true);
  const revealed = begin('reveal');
  /* Taken back into the hand, then played in front of the player again: the room gives it a new handle. */
  snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece !== first);
  const again = play('public-b-again');
  again.position = [2, 0, 2];
  expect(revealed()).toBe(false);
  const anchor = task('reveal').anchor;
  expect(anchor.kind === 'table' && anchor.point()).toEqual(again.position);
  again.items[0]!.faceUp = true;
  expect(revealed()).toBe(true);
});

test('only cards played and revealed during their own tasks count, and turning the decks over does not', () => {
  const { snapshot, begin, play } = exercise();
  snapshot.hand = [card('private-a'), card('private-b'), card('private-c')];
  /* Played and revealed before its task: neither task may tick off from it. */
  const early = play('public-early', true);
  const played = begin('play');
  /* Set on the side-table, or dropped on a deck: the hand shrinks, but no card lands. */
  snapshot.hand.pop();
  expect(played()).toBe(false);
  const later = play('public-later');
  expect(played()).toBe(true);
  const revealed = begin('reveal');
  expect(revealed()).toBe(false);
  for (const deck of snapshot.table.pieces.filter((piece) => piece !== early && piece !== later)) {
    deck.items[0]!.faceUp = true;
  }
  expect(revealed()).toBe(false);
  later.items[0]!.faceUp = true;
  expect(revealed()).toBe(true);
});

test('with no Treachery deck on the left, nothing counts as a played card', () => {
  const { snapshot, begin } = exercise();
  snapshot.table.pieces[0] = { ...snapshot.table.pieces[0]!, position: [1, 0, 1] } as Piece;
  snapshot.hand = [card('private-a')];
  const played = begin('play');
  snapshot.hand.pop();
  snapshot.table.pieces.push({ ...card('token'), stackKey: undefined } as unknown as Piece);
  expect(played()).toBe(false);
});

test('a card revealed in the pause after Play counts, and an earlier one counts once turned down and up again', () => {
  const { snapshot, begin, play } = exercise();
  snapshot.hand = [card('private-a'), card('private-b'), card('private-c')];
  const early = play('public-early', true);
  const played = begin('play');
  /* Revealed before the Reveal task begins. */
  const later = play('public-later', true);
  expect(played()).toBe(true);
  expect(begin('reveal')()).toBe(true);
  /* Only the earlier card left: it counts once seen face down and turned up again. */
  snapshot.table.pieces = snapshot.table.pieces.filter((piece) => piece !== later);
  const revealed = begin('reveal');
  expect(revealed()).toBe(false);
  early.items[0]!.faceUp = false;
  expect(revealed()).toBe(false);
  early.items[0]!.faceUp = true;
  expect(revealed()).toBe(true);
});
