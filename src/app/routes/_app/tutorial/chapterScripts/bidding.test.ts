import { factionTokenOf } from '@shared/play/factionToken';
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

/* Start a round at the learner, as the opening step leaves it. */
const openAtLearner = () => {
  game.act({ kind: 'bid-start', factionId: mine() });
  return game.snapshot().bidding!.round;
};

test('handing the bidder on before the raise step asks for it still brings the bidder back to the learner', () => {
  const round = openAtLearner();
  const step = game.step('raise');
  game.act({ kind: 'bid-pass', round });
  expect(game.snapshot().bidding!.turn).not.toBe(mine());
  /* Nobody bid, so the others pass the round out, and after a beat it opens again at the learner. */
  vi.advanceTimersByTime(20_000);
  expect(game.snapshot().bidding).toMatchObject({ stage: 'open', turn: mine() });
  const again = game.snapshot().bidding!.round;
  game.act({ kind: 'bid-raise', round: again });
  game.act({ kind: 'bid-raise', round: again });
  expect(step.done()).toBe(true);
});

test('a learner who hands on a small bid early gets outbid and the bidder comes back to them', () => {
  const round = openAtLearner();
  game.step('raise');
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-pass', round });
  vi.advanceTimersByTime(20_000);
  expect(game.snapshot().bidding).toMatchObject({ stage: 'open', round, turn: mine() });
  expect(game.snapshot().bidding!.bid!.factionId).not.toBe(mine());
});

test('a round reset while winning the card opens again at the learner', () => {
  openAtLearner();
  const step = game.step('win');
  game.act({ kind: 'bid-reset' });
  expect(game.snapshot().bidding!.stage).toBe('idle');
  vi.advanceTimersByTime(5000);
  expect(game.snapshot().bidding).toMatchObject({ stage: 'open', turn: mine() });
  const round = game.snapshot().bidding!.round;
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-pass', round });
  vi.advanceTimersByTime(20_000);
  expect(step.done()).toBe(true);
});

test('a round won before the lower step is done opens again so the learner can take a raise back', () => {
  const round = openAtLearner();
  const step = game.step('lower');
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-pass', round });
  vi.advanceTimersByTime(20_000);
  expect(game.snapshot().bidding).toMatchObject({ stage: 'open', turn: mine(), bid: null });
  const again = game.snapshot().bidding!.round;
  game.act({ kind: 'bid-raise', round: again });
  expect(step.done()).toBe(false);
  game.act({ kind: 'bid-raise', round: again });
  game.act({ kind: 'bid-lower', round: again });
  expect(step.done()).toBe(true);
});

test('the hand-on step counts the learner handing the bidder on, even when that ends the round', () => {
  const round = openAtLearner();
  const step = game.step('hand-on');
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-raise', round });
  game.act({ kind: 'bid-pass', round });
  expect(step.done()).toBe(true);
  vi.advanceTimersByTime(20_000);
  expect(game.snapshot().bidding!.stage).toBe('won');
});

test('a learner who presses pass twice and sits out still gets a round back at their faction', () => {
  const round = openAtLearner();
  const step = game.step('raise');
  game.act({ kind: 'bid-pass', round });
  const token = factionTokenOf(game.snapshot().table.pieces, mine())!;
  game.act({ kind: 'flip', pieceId: token.id });
  expect(factionTokenOf(game.snapshot().table.pieces, mine())!.items[0]!.faceUp).toBe(false);
  vi.advanceTimersByTime(20_000);
  expect(factionTokenOf(game.snapshot().table.pieces, mine())!.items[0]!.faceUp).toBe(true);
  expect(game.snapshot().bidding).toMatchObject({ stage: 'open', turn: mine() });
  const again = game.snapshot().bidding!.round;
  game.act({ kind: 'bid-raise', round: again });
  game.act({ kind: 'bid-raise', round: again });
  expect(step.done()).toBe(true);
});
