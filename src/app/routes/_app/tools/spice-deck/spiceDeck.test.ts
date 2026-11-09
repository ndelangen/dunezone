import { describe, expect, test } from 'vite-plus/test';

import {
  blowAll,
  blowPile,
  blowSentence,
  canReveal,
  newGame,
  nexus,
  nextTurn,
  remaining,
  revealOne,
  wormChance,
} from './spiceDeck';
import type { SpiceDeckDef, SpiceDeckGame } from './spiceDeck';

const DECK: SpiceDeckDef = {
  id: 'test',
  name: 'Test deck',
  cards: [
    { key: 'broken-land', name: 'Broken Land', amount: 8, count: 1 },
    { key: 'old-gap', name: 'Old Gap', amount: 6, count: 1 },
    { key: 'red-chasm', name: 'Red Chasm', amount: 8, count: 1 },
    { key: 'shai-hulud', name: 'Shai-Hulud', count: 2 },
  ],
};

/* A game whose deck is stacked: the first copy listed is turned over first. */
const stacked = (order: string[], piles: 1 | 2 = 2, wormsPerPhase?: number): SpiceDeckGame => ({
  ...newGame(DECK, Math.random, wormsPerPhase === undefined ? { piles } : { piles, wormsPerPhase }),
  draw: [...order].reverse(),
});

const keepOrder = () => 0.999999;

describe('Spice Blow', () => {
  test('a spice card lands on the pile being blown, and the next blow goes to the next pile', () => {
    let game = blowPile(stacked(['old-gap#1', 'broken-land#1']), keepOrder);
    expect(game.discards).toEqual([['old-gap#1'], []]);
    expect(game.pile).toBe(1);
    game = blowPile(game, keepOrder);
    expect(game.discards).toEqual([['old-gap#1'], ['broken-land#1']]);
    expect(canReveal(game)).toBe(false);
  });

  test('on the first turn Shai-Hulud is set aside, drawn past, and shuffled back once the Spice Blow is over', () => {
    let game = blowPile(stacked(['shai-hulud#1', 'old-gap#1', 'broken-land#1', 'red-chasm#1']), keepOrder);
    expect(game.setAside).toEqual(['shai-hulud#1']);
    expect(game.blows[0]!.reveals.map((reveal) => reveal.kind)).toEqual(['set-aside', 'spice']);
    expect(nexus(game)).toBe(false);
    game = blowPile(game, keepOrder);
    expect(game.setAside).toEqual([]);
    expect(game.draw).toContain('shai-hulud#1');
    expect(game.draw).toHaveLength(2);
  });

  test('from the second turn on, Shai-Hulud devours the territory below it on its own pile, and a Nexus follows', () => {
    let game = blowAll(
      stacked(['old-gap#1', 'broken-land#1', 'shai-hulud#1', 'shai-hulud#2', 'red-chasm#1']),
      keepOrder
    );
    game = blowPile(nextTurn(game), keepOrder);
    const reveals = game.blows.at(-1)!.reveals;
    expect(reveals).toEqual([
      { card: 'shai-hulud#1', kind: 'worm', devours: 'old-gap#1' },
      { card: 'shai-hulud#2', kind: 'worm', devours: 'old-gap#1' },
      { card: 'red-chasm#1', kind: 'spice' },
    ]);
    expect(game.discards[0]).toEqual(['old-gap#1', 'shai-hulud#1', 'shai-hulud#2', 'red-chasm#1']);
    expect(nexus(game)).toBe(true);
    expect(blowSentence(game, game.blows.at(-1)!)).toBe(
      'Spice Blow A: Shai-Hulud! It devours everything in Old Gap. Shai-Hulud! It devours everything in Old Gap. 8 spice in Red Chasm.'
    );
  });

  test('an empty deck is made again from both discard piles', () => {
    let game = blowAll(stacked(['old-gap#1', 'broken-land#1']), keepOrder);
    game = blowPile(nextTurn(game), keepOrder);
    expect(game.blows.at(-1)!.reveals[0]).toEqual({ card: null, kind: 'reshuffle' });
    expect(game.discards.flat()).toHaveLength(1);
    expect(game.draw).toHaveLength(1);
  });

  test('cards are turned one at a time into the same blow', () => {
    let game = nextTurn(blowAll(stacked(['old-gap#1', 'broken-land#1', 'shai-hulud#1', 'red-chasm#1']), keepOrder));
    game = revealOne(game, keepOrder);
    expect(game.pile).toBe(0);
    game = revealOne(game, keepOrder);
    expect(game.pile).toBe(1);
    expect(game.blows.filter((blow) => blow.turn === 2)).toHaveLength(1);
  });

  test('past the ruleset limit, another Shai-Hulud in the same Spice Blow is ignored and shuffled back', () => {
    let game = blowAll(stacked(['old-gap#1', 'shai-hulud#1', 'shai-hulud#2', 'red-chasm#1'], 1, 1), keepOrder);
    game = blowPile(nextTurn(game), keepOrder);
    expect(game.blows.at(-1)!.reveals.map((reveal) => reveal.kind)).toEqual(['worm', 'ignored', 'spice']);
    expect(game.draw).toContain('shai-hulud#2');
    expect(game.discards[0]).not.toContain('shai-hulud#2');
  });

  test('a single pile blows once a turn', () => {
    const game = blowAll(stacked(['old-gap#1', 'broken-land#1'], 1), keepOrder);
    expect(game.discards).toEqual([['old-gap#1']]);
    expect(game.blows).toHaveLength(1);
  });

  test('what is left and the chance of Shai-Hulud next', () => {
    const game = stacked(['old-gap#1', 'shai-hulud#1', 'broken-land#1', 'red-chasm#1']);
    expect(wormChance(game)).toBe(0.25);
    expect(remaining(game).find(({ card }) => card.key === 'shai-hulud')!.left).toBe(1);
  });
});
