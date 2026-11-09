import { describe, expect, it } from 'vitest';

import { bid, bidders, highBid, newAuction, pass, phaseOver, resultSentence, toBid } from './auction';
import type { AuctionSeat } from './auction';

const seat = (id: string, extra: Partial<AuctionSeat> = {}): AuctionSeat => ({
  faction: { id, name: id },
  hand: 1,
  limit: 4,
  ...extra,
});

const deck = { name: 'Treachery', back: '' };

describe('the auction', () => {
  it('puts up one card for each faction with room, and the first seat with room opens', () => {
    const game = newAuction(deck, [seat('a', { hand: 4 }), seat('b'), seat('c', { paid: true })]);
    expect(game.cards).toBe(2);
    expect(toBid(game)).toBe('b');
    expect(bidders(game)).toEqual(['b', 'c']);
  });

  it('takes a jump in one go and hands the bid on', () => {
    let game = newAuction(deck, [seat('a'), seat('b'), seat('c')]);
    game = bid(game, 4);
    expect(highBid(game)).toEqual({ factionId: 'a', amount: 4 });
    expect(toBid(game)).toBe('b');
    expect(() => bid(game, 4)).toThrow('Bid at least 5.');
  });

  it('gives the card to the high bidder once everyone else passed, and opens the next card one seat on', () => {
    let game = newAuction(deck, [seat('a'), seat('b', { bonus: true, limit: 8 }), seat('c', { paid: true })]);
    game = bid(game, 1);
    game = bid(game, 2);
    game = pass(game);
    game = pass(game);
    expect(game.results).toEqual([{ card: 0, faction: 'b', amount: 2, bonus: true }]);
    expect(game.seats[1]!.hand).toBe(3);
    expect(resultSentence(game, game.results[0]!)).toBe(
      'b pays 2 spice to c and takes the card. b also draws a free card.'
    );
    expect(game.card).toBe(1);
    expect(toBid(game)).toBe('b');
  });

  it('ends the phase when everyone passes on a card, the rest going back on the deck', () => {
    let game = newAuction(deck, [seat('a'), seat('b'), seat('c')]);
    game = pass(game);
    game = pass(game);
    game = pass(game);
    expect(phaseOver(game)).toBe(true);
    expect(game.returned).toBe(2);
    expect(resultSentence(game, game.results[0]!)).toBe(
      'Everyone passed. Put this card and the other 2 back on the deck.'
    );
  });

  it('skips a faction whose hand fills up', () => {
    let game = newAuction(deck, [seat('a', { hand: 3 }), seat('b'), seat('c')]);
    game = bid(game, 1);
    game = pass(game);
    game = pass(game);
    expect(game.seats[0]!.hand).toBe(4);
    expect(toBid(game)).toBe('b');
    game = pass(game);
    expect(toBid(game)).toBe('c');
  });
});
