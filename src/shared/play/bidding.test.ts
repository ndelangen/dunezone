import { describe, expect, test } from 'vitest';

import { applyBidding, BiddingRefusal, expireBid, idleBidding } from './bidding';
import type { BiddingState } from './bidding';

const order = ['a', 'b', 'c', 'd'];
const at = (factionId: string | null, eligible: readonly string[] = order, now = 0) => ({
  factionId,
  order,
  eligible,
  now,
});

function opened(eligible: readonly string[] = order): BiddingState {
  return applyBidding(idleBidding(10), { kind: 'bid-open' }, at('c', eligible, 1000));
}

describe('the bidder', () => {
  test('opens the first card on the first bidding faction in storm order, with its time running', () => {
    expect(opened()).toMatchObject({ stage: 'open', round: 1, opener: 'a', turn: 'a', bid: null, deadline: 11_000 });
    expect(opened(['b', 'd'])).toMatchObject({ opener: 'b', turn: 'b' });
  });

  test('opens each later card one faction further along', () => {
    const sold = { ...opened(), stage: 'sold' as const };
    expect(applyBidding(sold, { kind: 'bid-open' }, at('c'))).toMatchObject({ round: 2, opener: 'b', turn: 'b' });
  });

  test('raising keeps the bidder on the raiser, a pass moves it on, and the card sells once it comes back round', () => {
    let state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a', order, 2000));
    state = applyBidding(state, { kind: 'bid-raise', round: 1 }, at('a', order, 3000));
    expect(state).toMatchObject({ turn: 'a', bid: { factionId: 'a', amount: 2 }, deadline: 13_000 });
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('a'));
    expect(state.turn).toBe('b');
    state = applyBidding(state, { kind: 'bid-raise', round: 1 }, at('b'));
    expect(state.bid).toEqual({ factionId: 'b', amount: 3 });
    for (const faction of ['b', 'c', 'd']) {
      state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at(faction));
    }
    expect(state.turn).toBe('a');
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('a'));
    expect(state).toMatchObject({ stage: 'sold', turn: 'b', bid: { factionId: 'b', amount: 3 }, deadline: null });
  });

  test('skips a faction whose token is face down', () => {
    const state = applyBidding(opened(['a', 'c']), { kind: 'bid-pass', round: 1 }, at('a', ['a', 'c']));
    expect(state.turn).toBe('c');
  });

  test('a card nobody bids on goes unsold once every bidding faction passed', () => {
    let state = opened(['a', 'b']);
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('a', ['a', 'b']));
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('b', ['a', 'b']));
    expect(state).toMatchObject({ stage: 'unsold', turn: null });
  });

  test('only the faction the bidder points at can act', () => {
    expect(() => applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('b'))).toThrow(BiddingRefusal);
    expect(() => applyBidding(opened(), { kind: 'bid-raise', round: 2 }, at('a'))).toThrow(BiddingRefusal);
  });

  test('passes for a faction whose time ran out, and not before', () => {
    const state = opened();
    expect(expireBid(state, { order, eligible: order, now: 10_999 })).toBeUndefined();
    expect(expireBid(state, { order, eligible: order, now: 11_000 })).toMatchObject({ turn: 'b', deadline: 21_000 });
  });
});
