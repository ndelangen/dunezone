import { describe, expect, test } from 'vite-plus/test';

import {
  blowAll,
  blowPile,
  blowSentence,
  lastPlayed,
  nextPile,
  spiceBlowOver,
  newGame,
  nexus,
  nextTurn,
  remaining,
  revealOne,
  setAsideLast,
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
const stacked = (order: string[], piles = 2): SpiceDeckGame => ({
  ...newGame(DECK, Math.random, { piles }),
  draw: [...order].reverse(),
});

const keepOrder = () => 0.999999;

describe('Spice Blow', () => {
  test('a spice card lands on the pile being blown, and the next blow goes to the next pile', () => {
    let game = blowPile(stacked(['old-gap#1', 'broken-land#1']), keepOrder);
    expect(game.discards).toEqual([['old-gap#1'], []]);
    expect(nextPile(game)).toBe(1);
    game = blowPile(game, keepOrder);
    expect(game.discards).toEqual([['old-gap#1'], ['broken-land#1']]);
    expect(spiceBlowOver(game)).toBe(true);
  });

  test('Shai-Hulud lands on its pile like any card; the players set it aside, and it goes back in when the next turn starts', () => {
    let game = revealOne(stacked(['shai-hulud#1', 'old-gap#1', 'broken-land#1', 'red-chasm#1']), keepOrder, 0);
    expect(game.discards[0]).toEqual(['shai-hulud#1']);
    expect(game.blows[0]!.reveals).toEqual([{ card: 'shai-hulud#1', kind: 'worm' }]);
    game = setAsideLast(game);
    expect(game.discards[0]).toEqual([]);
    expect(game.setAside).toEqual(['shai-hulud#1']);
    expect(lastPlayed(game)).toBeUndefined();
    game = revealOne(game, keepOrder, 0);
    expect(game.blows[0]!.reveals.map((reveal) => reveal.kind)).toEqual(['set-aside', 'spice']);
    expect(nexus(game)).toBe(false);
    game = nextTurn(game, keepOrder);
    expect(game.setAside).toEqual([]);
    expect(game.draw).toContain('shai-hulud#1');
  });

  test('from the second turn on, Shai-Hulud devours the territory below it on its own pile, and a Nexus follows', () => {
    let game = blowAll(
      stacked(['old-gap#1', 'broken-land#1', 'shai-hulud#1', 'shai-hulud#2', 'red-chasm#1']),
      keepOrder
    );
    game = blowPile(nextTurn(game, keepOrder), keepOrder);
    const reveals = game.blows.at(-1)!.reveals;
    expect(reveals).toEqual([
      { card: 'shai-hulud#1', kind: 'worm', devours: 'old-gap#1' },
      { card: 'shai-hulud#2', kind: 'worm', devours: 'old-gap#1' },
      { card: 'red-chasm#1', kind: 'spice' },
    ]);
    expect(game.discards[0]).toEqual(['old-gap#1', 'shai-hulud#1', 'shai-hulud#2', 'red-chasm#1']);
    expect(nexus(game)).toBe(true);
    expect(blowSentence(game, game.blows.at(-1)!)).toBe(
      'Spice pile A: Shai-Hulud! It devours everything in Old Gap. Shai-Hulud! It devours everything in Old Gap. 8 spice in Red Chasm.'
    );
  });

  test('an empty deck is made again from both discard piles', () => {
    let game = blowAll(stacked(['old-gap#1', 'broken-land#1']), keepOrder);
    game = blowPile(nextTurn(game, keepOrder), keepOrder);
    expect(game.blows.at(-1)!.reveals[0]).toEqual({ card: null, kind: 'reshuffle' });
    expect(game.discards.flat()).toHaveLength(1);
    expect(game.draw).toHaveLength(1);
  });

  test('one card per tap, onto the pile the players chose, and never more by itself', () => {
    let game = nextTurn(
      blowAll(stacked(['old-gap#1', 'broken-land#1', 'shai-hulud#1', 'red-chasm#1']), keepOrder),
      keepOrder
    );
    game = revealOne(game, keepOrder, 1);
    expect(game.discards[1]).toEqual(['broken-land#1', 'shai-hulud#1']);
    expect(game.blows.at(-1)).toEqual({
      turn: 2,
      pile: 1,
      reveals: [{ card: 'shai-hulud#1', kind: 'worm', devours: 'broken-land#1' }],
    });
    expect(nextPile(game)).toBe(0);
    game = revealOne(game, keepOrder, 1);
    expect(game.blows.filter((blow) => blow.turn === 2)).toHaveLength(1);
    expect(game.blows.at(-1)!.reveals).toHaveLength(2);
  });

  test('a card onto a pile whose blow is still open is the newest, after a card on another pile', () => {
    let game = nextTurn(
      blowAll(stacked(['old-gap#1', 'broken-land#1', 'shai-hulud#1', 'red-chasm#1', 'shai-hulud#2']), keepOrder),
      keepOrder
    );
    game = revealOne(game, keepOrder, 0);
    game = revealOne(game, keepOrder, 1);
    game = revealOne(game, keepOrder, 0);
    expect(game.blows.at(-1)).toMatchObject({
      pile: 0,
      reveals: [{ kind: 'worm' }, { card: 'shai-hulud#2', kind: 'worm' }],
    });
    expect(lastPlayed(game)?.card).toBe('shai-hulud#2');
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
