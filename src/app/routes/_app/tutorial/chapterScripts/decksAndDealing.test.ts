import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import { chapterTable } from './chapterTable.test.fixture';
import { decksAndDealing } from './decksAndDealing';

let game: ReturnType<typeof chapterTable>;
const deck = (side: number) =>
  game
    .snapshot()
    .table.pieces.find((piece) => piece.stackKey?.startsWith('deck:') && Math.sign(piece.position[0]) === side)!;

beforeEach(() => {
  game = chapterTable(decksAndDealing);
});
afterEach(() => game.dispose());

test('requires six cards from Treachery, rather than six Spice cards or three Treachery cards', () => {
  const step = game.step('split');
  game.act({ kind: 'split', pieceId: deck(1).id, count: 6 });
  expect(step.done()).toBe(false);
  game.act({ kind: 'split', pieceId: deck(-1).id, count: 3 });
  expect(step.done()).toBe(false);
  game.act({ kind: 'split', pieceId: deck(-1).id, count: 6 });
  expect(step.done()).toBe(true);
});

test('requesting six when only five remain does not pass a five-card pile as six', () => {
  const source = deck(-1).id;
  for (let deal = 0; deal < 10; deal++) {
    game.act({ kind: 'deck-draw', pieceId: source, count: 4 });
  }
  expect(deck(-1).items).toHaveLength(5);
  const step = game.step('split');
  game.act({ kind: 'split', pieceId: source, count: 6 });
  expect(game.table.refusal).toBeUndefined();
  expect(step.done()).toBe(false);
});

test('the six-card pile must lie face down', () => {
  const step = game.step('split');
  const source = deck(-1).id;
  game.act({ kind: 'flip', pieceId: source });
  game.act({ kind: 'split', pieceId: source, count: 6 });
  expect(step.done()).toBe(false);
  const pile = game.snapshot().table.pieces.find((piece) => piece.items.length === 6)!;
  game.act({ kind: 'flip', pieceId: pile.id });
  expect(step.done()).toBe(true);
});
