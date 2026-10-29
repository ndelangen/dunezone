/* @vitest-environment jsdom */
import { afterEach, beforeEach, expect, test } from 'vite-plus/test';

import { chapterTable } from './chapterTable.test.fixture';
import { setup } from './setup';

let game: ReturnType<typeof chapterTable>;
const piles = () => game.snapshot().table.pieces.filter((piece) => piece.items[0]?.artwork?.backName === 'Traitor');
const hand = () => (game.snapshot().hand ?? []).filter((piece) => piece.items[0]?.artwork?.type === 'card-traitor');
const mine = () => game.snapshot().bank!.factionId;
const lock = () =>
  game.act({
    kind: 'prediction-lock',
    stepId: game.snapshot().setup!.steps[0]!.id,
    choice: { factionId: mine(), turn: 1 },
  });
const gather = () => game.act({ kind: 'traitors-gather' });
const deal = (count: 1 | 4) => game.act({ kind: 'deck-draw', pieceId: piles()[0]!.id, recipient: mine(), count });
const discard = () => game.act({ kind: 'hand-play', pieceId: hand()[0]!.id, position: [0, 0.132, 7] });
const traitorPhase = () => {
  lock();
  game.act({ kind: 'phase' });
};

beforeEach(() => {
  game = chapterTable(setup);
});
afterEach(() => {
  game.dispose();
  document.body.innerHTML = '';
});

test('prediction locks into the learner hand and only its close-up, followed by closing it, completes the hand step', () => {
  const prediction = game.step('prediction');
  expect(prediction.done()).toBe(false);
  lock();
  expect(prediction.done()).toBe(true);
  expect(game.snapshot().hand?.some((piece) => piece.items[0]?.artwork?.type === 'card-prediction')).toBe(true);
  const preview = game.step('hand');
  document.body.innerHTML =
    '<div data-window="hand"></div><div data-piece-close-up data-piece-type="card-traitor"></div>';
  expect(preview.done()).toBe(false);
  document.querySelector('[data-piece-close-up]')!.remove();
  expect(preview.done()).toBe(false);
  document.body.innerHTML = '<div data-piece-close-up data-piece-type="card-prediction"></div>';
  expect(preview.done()).toBe(false);
  document.body.innerHTML = '';
  expect(preview.done()).toBe(true);
});

test('gathers thirty, shuffles, deals four, discards three, gathers twenty-nine and requires learner deletion', () => {
  traitorPhase();
  const combine = game.step('gather-traitors');
  expect(piles()).toHaveLength(6);
  expect(combine.done()).toBe(false);
  gather();
  expect(combine.done()).toBe(true);
  expect(piles()[0]!.items).toHaveLength(30);
  const shuffle = game.step('shuffle-traitors');
  const before = piles()[0]!.items.map((item) => item.id);
  game.act({
    kind: 'deck-shuffle',
    pieceId: game.snapshot().table.pieces.find((piece) => piece.stackKey?.startsWith('deck:'))!.id,
  });
  expect(shuffle.done()).toBe(false);
  game.act({ kind: 'deck-shuffle', pieceId: piles()[0]!.id });
  expect(shuffle.done()).toBe(true);
  expect(piles()[0]!.items.every((item) => !before.includes(item.id))).toBe(true);
  const dealt = game.step('deal-traitors');
  expect(dealt.done()).toBe(false);
  deal(4);
  expect(dealt.done()).toBe(true);
  expect(hand()).toHaveLength(4);
  const keep = game.step('keep-traitor');
  discard();
  discard();
  expect(keep.done()).toBe(false);
  discard();
  expect(keep.done()).toBe(true);
  expect(hand()).toHaveLength(1);
  const cleanup = game.step('gather-discards');
  expect(cleanup.done()).toBe(false);
  gather();
  expect(cleanup.done()).toBe(true);
  expect(piles()[0]!.items).toHaveLength(29);
  const remove = game.step('delete-discards');
  expect(remove.done()).toBe(false);
  const other = game.snapshot().table.pieces.find((piece) => piece.stackKey?.startsWith('deck:'))!;
  game.act({ kind: 'delete', pieceId: other.id });
  expect(remove.done()).toBe(false);
  game.act({ kind: 'delete', pieceId: piles()[0]!.id });
  expect(remove.done()).toBe(true);
  expect(hand()).toHaveLength(1);
  expect(piles()).toHaveLength(0);
  expect(game.table.refusal).toBeUndefined();
});

test('five cards do not pass the step that asks the learner to keep one and discard three', () => {
  traitorPhase();
  gather();
  const step = game.step('deal-traitors');
  deal(1);
  deal(4);
  expect(hand()).toHaveLength(5);
  expect(step.done()).toBe(false);
  discard();
  expect(step.done()).toBe(true);
});

test('deleting only part of the gathered leftovers does not complete cleanup', () => {
  traitorPhase();
  gather();
  deal(4);
  discard();
  discard();
  discard();
  gather();
  const step = game.step('delete-discards');
  const pile = piles()[0]!;
  game.act({ kind: 'split', pieceId: pile.id, count: 6 });
  game.act({ kind: 'delete', pieceId: pile.id });
  expect(piles()[0]!.items).toHaveLength(6);
  expect(step.done()).toBe(false);
  game.act({ kind: 'delete', pieceId: piles()[0]!.id });
  expect(step.done()).toBe(true);
});
