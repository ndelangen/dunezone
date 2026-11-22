/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vite-plus/test';

import { newGame } from './spiceDeck';
import type { Random, SpiceDeckDef } from './spiceDeck';
import { useSpiceDeckGame } from './useSpiceDeckGame';

const deck = (id: string): SpiceDeckDef => ({
  id,
  name: `${id} deck`,
  cards: [
    { key: 'basin', name: 'Basin', count: 2, amount: 8 },
    { key: 'worm', name: 'Shai-Hulud', count: 2 },
  ],
});

const random: Random = () => 0.5;
const KEY = 'spice-deck-test';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

test('starting a new game keeps the one it replaces a step back', () => {
  const first = newGame(deck('gf9'), random);
  const { result } = renderHook(() => useSpiceDeckGame(KEY, first, random));
  const second = newGame(deck('gf9'), random, { piles: 2 });
  act(() => result.current.start(second));
  expect(result.current.game).toBe(second);
  expect(result.current.canUndo).toBe(true);
  act(() => result.current.undo());
  expect(result.current.game).toBe(first);
});

test('a game from before another deck was picked comes back with its own deck after a reload', () => {
  const first = newGame(deck('gf9'), random);
  const { result, unmount } = renderHook(() => useSpiceDeckGame(KEY, first, random));
  act(() => result.current.start(newGame(deck('dreamrules'), random)));
  unmount();

  const reloaded = renderHook(() => useSpiceDeckGame(KEY, undefined, random));
  expect(reloaded.result.current.game?.deck.id).toBe('dreamrules');
  act(() => reloaded.result.current.undo());
  expect(reloaded.result.current.game?.deck.id).toBe('gf9');
});

test('a ruleset whose deck changed between two games keeps the older deck for the older game', () => {
  const before = deck('gf9');
  const first = newGame(before, random);
  const { result, unmount } = renderHook(() => useSpiceDeckGame(KEY, first, random));
  const after: SpiceDeckDef = { ...before, cards: [{ key: 'arrakeen', name: 'Arrakeen', count: 4, amount: 6 }] };
  act(() => result.current.start(newGame(after, random)));
  unmount();

  const reloaded = renderHook(() => useSpiceDeckGame(KEY, undefined, random));
  act(() => reloaded.result.current.undo());
  expect(reloaded.result.current.game?.deck.cards.map((card) => card.key)).toEqual(['basin', 'worm']);
});
