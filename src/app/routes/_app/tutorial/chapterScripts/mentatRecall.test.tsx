/* @vitest-environment jsdom */

import type { GameSnapshot } from '@shared/play/protocol';
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test';

import type { TablePlayers } from './chapterScript';
import { mentatRecall } from './mentatRecall';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

test.each([
  { name: 'without a review', review: null },
  { name: 'for a withdrawn review', review: { id: 'old-review', step: 0 } },
])('an Enter pressed $name cannot agree to a later review', ({ review }) => {
  let view = { controls: { players: [] }, review } as unknown as GameSnapshot;
  const players = { others: () => [], act: vi.fn() } as unknown as TablePlayers;
  const agreement = mentatRecall.tasks(() => view, players).find((step) => step.id === 'review-majority')!;
  const watch = agreement.begin(undefined as never);
  const enter = () => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  };
  try {
    enter();
    view = { ...view, review: { id: 'new-review', step: 0 } } as unknown as GameSnapshot;
    expect(agreement.done(watch, undefined as never)).toBe(false);
    enter();
    expect(agreement.done(watch, undefined as never)).toBe(true);
  } finally {
    agreement.finish?.(watch);
  }
});

const running = (id = 'recall-1', step = 0, startedAt: number | null = 1) => ({
  id,
  step,
  startedAt,
  ballots: [{ seat: 'other', choice: null }],
});
const people = () => ({ others: () => ['other'], act: vi.fn() }) as unknown as TablePlayers;
const viewWith = (review: ReturnType<typeof running> | null) =>
  ({ review, controls: { players: [] } }) as unknown as GameSnapshot;
const stepAt = (id: string, view: () => GameSnapshot, players = people()) =>
  mentatRecall.tasks(view, players).find((step) => step.id === id)!;
const recallFrame = () => {
  const root = document.createElement('div');
  root.setAttribute('data-recall-controls', 'true');
  document.body.append(root);
  return root;
};

test('the retained live hand and a loading recalled inventory cannot complete the inventory task', () => {
  document.body.innerHTML = '<div data-window="hand"><output aria-label="Spice reserve balance">10</output></div>';
  const root = recallFrame();
  const step = stepAt('recalled-hand', () => viewWith(running()));
  const watch = step.begin(undefined as never);
  try {
    expect(step.done(watch, undefined as never)).toBe(false);
    root.innerHTML =
      '<div data-window="hand"><output aria-label="Spice reserve balance">10</output><span aria-label="Loading recalled inventory"></span></div>';
    expect(step.done(watch, undefined as never)).toBe(false);
    root.querySelector('span')!.remove();
    expect(step.done(watch, undefined as never)).toBe(true);
  } finally {
    step.finish?.(watch);
  }
});

test('an early return can be followed by another recall, with a fresh timeline baseline and no leftover ballot timer', () => {
  const root = recallFrame();
  root.innerHTML = '<div data-window="recall-history"><div role="slider"></div></div>';
  let view = viewWith(running());
  const players = people();
  const step = stepAt('shared-history', () => view, players);
  const watch = step.begin(undefined as never);
  view = viewWith(null);
  expect(step.done(watch, undefined as never)).toBe(false);
  view = viewWith(running('replacement', 0, null));
  vi.advanceTimersByTime(1500);
  expect(players.act).toHaveBeenLastCalledWith('other', {
    kind: 'review-ballot',
    reviewId: 'replacement',
    choice: 'review',
  });
  view = viewWith(running('replacement', 1));
  expect(step.done(watch, undefined as never)).toBe(false);
  view = viewWith(running('replacement', 0));
  expect(step.done(watch, undefined as never)).toBe(true);
  step.finish?.(watch);
  view = viewWith(running('after-reset', 0, null));
  vi.advanceTimersByTime(3000);
  expect(players.act).toHaveBeenCalledOnce();
});

test('chat advances on a newly saved submitted message, and a replacement recall needs a new submission', () => {
  const root = recallFrame();
  root.innerHTML =
    '<div data-window="recall-chat"><div aria-label="Conversation history"><span data-saved-own-message>Sent</span></div><form></form></div>';
  let view = viewWith(running());
  const step = stepAt('recall-chat', () => view);
  const watch = step.begin(undefined as never);
  const submit = () => root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }));
  const addSent = () => {
    root
      .querySelector('[aria-label="Conversation history"]')!
      .insertAdjacentHTML('beforeend', '<span data-saved-own-message>Sent</span>');
  };
  try {
    expect(step.done(watch, undefined as never)).toBe(false);
    submit();
    expect(step.done(watch, undefined as never)).toBe(false);
    root.querySelector('[aria-label="Conversation history"]')!.insertAdjacentHTML('beforeend', '<span>Sent</span>');
    expect(step.done(watch, undefined as never)).toBe(false);
    addSent();
    expect(step.done(watch, undefined as never)).toBe(true);
    view = viewWith(running('replacement'));
    expect(step.done(watch, undefined as never)).toBe(false);
    addSent();
    expect(step.done(watch, undefined as never)).toBe(false);
    submit();
    addSent();
    expect(step.done(watch, undefined as never)).toBe(true);
  } finally {
    step.finish?.(watch);
  }
});

test('leaving the chat task removes its submit listener', () => {
  const root = recallFrame();
  root.innerHTML = '<div data-window="recall-chat"><div aria-label="Conversation history"></div><form></form></div>';
  const step = stepAt('recall-chat', () => viewWith(running()));
  const watch = step.begin(undefined as never);
  step.finish?.(watch);
  root.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true }));
  root.querySelector('[aria-label="Conversation history"]')!.innerHTML = '<span data-saved-own-message>Sent</span>';
  expect(step.done(watch, undefined as never)).toBe(false);
});
