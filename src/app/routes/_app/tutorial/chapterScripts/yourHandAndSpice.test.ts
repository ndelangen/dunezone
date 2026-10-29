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
