import { describe, expect, test } from 'vitest';

import { applyBidding, BiddingRefusal, expireBid, idleBidding, reconcileBidding } from './bidding';
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
  test('opens the first round on the first bidding faction in storm order, with its time running', () => {
    expect(opened()).toMatchObject({ stage: 'open', round: 1, opener: 'a', turn: 'a', bid: null, deadline: 11_000 });
    expect(opened(['b', 'd'])).toMatchObject({ opener: 'b', turn: 'b' });
  });

  test('opens each later round one faction further along', () => {
    const won = { ...opened(), stage: 'won' as const };
    expect(applyBidding(won, { kind: 'bid-open' }, at('c'))).toMatchObject({ round: 2, opener: 'b', turn: 'b' });
  });

  test('raising keeps the bidder on the raiser, a pass moves it on, and the round is won once it comes back round', () => {
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
    expect(state).toMatchObject({ stage: 'won', turn: 'b', bid: { factionId: 'b', amount: 3 }, deadline: null });
  });

  test('skips a faction whose token is face down', () => {
    const state = applyBidding(opened(['a', 'c']), { kind: 'bid-pass', round: 1 }, at('a', ['a', 'c']));
    expect(state.turn).toBe('c');
  });

  test('a round nobody bids in ends unclaimed once every bidding faction passed', () => {
    let state = opened(['a', 'b']);
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('a', ['a', 'b']));
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('b', ['a', 'b']));
    expect(state).toMatchObject({ stage: 'unclaimed', turn: null });
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

describe('the bidder when a token flips mid-round', () => {
  const pass = (state: BiddingState, faction: string, eligible: readonly string[]) =>
    applyBidding(state, { kind: 'bid-pass', round: 1 }, at(faction, eligible));

  test('still ends the round once the high bidder turns its token face down', () => {
    let state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
    state = pass(state, 'a', order);
    const without = ['b', 'c', 'd'];
    for (const faction of without) {
      state = pass(state, faction, without);
    }
    expect(state).toMatchObject({ stage: 'won', turn: 'a', bid: { factionId: 'a', amount: 1 } });
  });

  test('refuses a raise from a faction whose token is face down', () => {
    expect(() => applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a', ['b', 'c', 'd']))).toThrow(
      BiddingRefusal
    );
  });

  test('skips a faction that turns its token face down while the bidder waits on it, without counting a pass', () => {
    const state = reconcileBidding(opened(), { order, eligible: ['b', 'c', 'd'], now: 5000 });
    expect(state).toMatchObject({ stage: 'open', turn: 'b', passes: 0, deadline: 15_000 });
  });

  test('ends the round once nobody is left to outbid the high bid', () => {
    const state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
    expect(reconcileBidding(state, { order, eligible: ['a'], now: 0 })).toMatchObject({ stage: 'won', turn: 'a' });
    expect(reconcileBidding(state, { order, eligible: [], now: 0 })).toMatchObject({ stage: 'won', turn: 'a' });
  });

  test('leaves a round alone while the faction it waits on still bids', () => {
    const state = opened();
    expect(reconcileBidding(state, { order, eligible: order, now: 5000 })).toBe(state);
  });
});
