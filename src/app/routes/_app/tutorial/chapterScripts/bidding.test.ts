import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import { bidding } from './bidding';
import { chapterTable } from './chapterTable.test.fixture';

let game: ReturnType<typeof chapterTable>;
const mine = () => game.snapshot().bank!.factionId;
const other = () => game.snapshot().roster!.seats.find((seat) => seat.faction?.id !== mine())!.faction!.id;

beforeEach(() => {
  vi.useFakeTimers();
  game = chapterTable(bidding);
});
afterEach(() => {
  game.dispose();
  vi.useRealTimers();
});

test.each(['own', 'another'] as const)(
  'starting on %s faction reaches the learner and stops recovery before the completion pause',
  (choice) => {
    const step = game.step('start');
    game.act({ kind: 'bid-start', factionId: choice === 'own' ? mine() : other() });
    if (choice === 'another') {
      expect(step.done()).toBe(false);
      vi.advanceTimersByTime(200);
    }
    expect(step.done()).toBe(true);
    const round = game.snapshot().bidding!.round;
    game.act({ kind: 'bid-raise', round });
    game.act({ kind: 'bid-pass', round });
    expect(game.snapshot().bidding!.turn).not.toBe(mine());
    vi.advanceTimersByTime(600);
    expect(game.snapshot().bidding!.round).toBe(round);
    expect(game.snapshot().bidding!.turn).not.toBe(mine());
  }
);

test('leaving the opening step cancels its recovery timer', () => {
  const step = game.step('start');
  step.finish();
  game.act({ kind: 'bid-start', factionId: other() });
  const round = game.snapshot().bidding!.round;
  vi.advanceTimersByTime(1000);
  expect(game.snapshot().bidding!.turn).toBe(other());
  expect(game.snapshot().bidding!.round).toBe(round);
});

test('only taking a Treachery card into the learner hand completes the auction payment step', () => {
  const step = game.step('take-card');
  const deck = (side: number) =>
    game
      .snapshot()
      .table.pieces.find((piece) => piece.stackKey?.startsWith('deck:') && Math.sign(piece.position[0]) === side)!;
  game.act({ kind: 'deck-draw', pieceId: deck(1).id });
  expect(step.done()).toBe(false);
  game.act({ kind: 'deck-draw', pieceId: deck(-1).id, recipient: other() });
  expect(step.done()).toBe(false);
  game.act({ kind: 'deck-draw', pieceId: 'missing' });
  expect(step.done()).toBe(false);
  game.act({ kind: 'deck-draw', pieceId: deck(-1).id });
  expect(step.done()).toBe(true);
});
