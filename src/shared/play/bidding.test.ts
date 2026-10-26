import { describe, expect, test } from 'vite-plus/test';

import { applyBidding, BiddingRefusal, canLowerBid, expireBid, idleBidding, reconcileBidding } from './bidding';
import type { BiddingState } from './bidding';

const order = ['a', 'b', 'c', 'd'];
const at = (factionId: string | null, eligible: readonly string[] = order, now = 0) => ({
  factionId,
  order,
  eligible,
  now,
});

function opened(eligible: readonly string[] = order, factionId = eligible[0]!): BiddingState {
  return applyBidding(idleBidding(10, true), { kind: 'bid-start', factionId }, at('c', eligible, 1000));
}

describe('the bidder', () => {
  test('starts a round on the faction the players pick, with time for deals before the first bid or pass', () => {
    expect(opened()).toMatchObject({ stage: 'open', round: 1, opener: 'a', turn: 'a', bid: null, deadline: null });
    expect(opened(order, 'c')).toMatchObject({ opener: 'c', turn: 'c' });
  });

  test('will not start on a faction whose token is face down', () => {
    expect(() => opened(['b', 'd'], 'a')).toThrow(BiddingRefusal);
  });

  test('starting again drops the open round, and a raise sent for it is refused', () => {
    const raised = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
    const restarted = applyBidding(raised, { kind: 'bid-start', factionId: 'd' }, at('b'));
    expect(restarted).toMatchObject({ stage: 'open', round: 2, turn: 'd', bid: null, passed: [] });
    expect(() => applyBidding(restarted, { kind: 'bid-raise', round: 1 }, at('d'))).toThrow(BiddingRefusal);
  });

  test('a reset puts the bidder away and keeps its time and round count', () => {
    const reset = applyBidding(opened(), { kind: 'bid-reset' }, at('b'));
    expect(reset).toEqual({ ...idleBidding(10, true), round: 1 });
  });

  test('raising keeps the bidder on the raiser, a pass moves it on, and the round is won once it comes back round', () => {
    let state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a', order, 2000));
    state = applyBidding(state, { kind: 'bid-raise', round: 1 }, at('a', order, 3000));
    expect(state).toMatchObject({ turn: 'a', bid: { factionId: 'a', amount: 2 }, deadline: 28_000 });
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
    const state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a', order, 1000));
    expect(expireBid(state, { order, eligible: order, now: 25_999 })).toBeUndefined();
    expect(expireBid(state, { order, eligible: order, now: 26_000 })).toMatchObject({ turn: 'b', deadline: 51_000 });
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
    expect(state).toMatchObject({ stage: 'open', turn: 'b', passed: [], deadline: null });
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

  test('keeps the round open when a faction that already passed turns its token face down', () => {
    let state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
    state = pass(state, 'a', order);
    state = pass(state, 'b', order);
    const withoutB = ['a', 'c', 'd'];
    state = reconcileBidding(state, { order, eligible: withoutB, now: 0 });
    state = pass(state, 'c', withoutB);
    expect(state).toMatchObject({ stage: 'open', turn: 'd' });
    state = pass(state, 'd', withoutB);
    expect(state).toMatchObject({ stage: 'won', turn: 'a' });
  });
});

describe('optional timed bidding', () => {
  test('untimed bidding has no expiry, even after a bid or pass', () => {
    let state = applyBidding(idleBidding(), { kind: 'bid-start', factionId: 'a' }, at('a'));
    state = applyBidding(state, { kind: 'bid-raise', round: 1 }, at('a', order, 1000));
    state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('a', order, 2000));
    expect(state).toMatchObject({ timed: false, turn: 'b', deadline: null });
    expect(expireBid(state, { order, eligible: order, now: 1_000_000 })).toBeUndefined();
  });

  test('a first pass starts the next player clock; a new auction waits again', () => {
    expect(expireBid(opened(), { order, eligible: order, now: 1_000_000 })).toBeUndefined();
    const passed = applyBidding(opened(), { kind: 'bid-pass', round: 1 }, at('a', order, 2000));
    expect(passed).toMatchObject({ started: true, turn: 'b', deadline: 27_000 });
    const next = applyBidding(passed, { kind: 'bid-start', factionId: 'b' }, at('a', order, 3000));
    expect(next).toMatchObject({ timed: true, started: false, deadline: null });
  });

  test('disabling cancels the flashing grace period and enabling gives the active player fresh time', () => {
    const started = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a', order, 1000));
    const off = applyBidding(started, { kind: 'bid-timing', enabled: false }, at('c', order, 22_000));
    expect(off.deadline).toBeNull();
    expect(expireBid(off, { order, eligible: order, now: 50_000 })).toBeUndefined();
    const on = applyBidding(off, { kind: 'bid-timing', enabled: true }, at('c', order, 50_000));
    expect(on).toMatchObject({ timed: true, started: true, turn: 'a', bid: started.bid, deadline: 75_000 });
    expect(applyBidding(on, { kind: 'bid-timing', enabled: true }, at('b', order, 51_000))).toBe(on);
  });

  test('enabling during an untouched auction keeps time for deals until the first bid or pass', () => {
    const state = applyBidding(idleBidding(), { kind: 'bid-start', factionId: 'a' }, at('a'));
    expect(applyBidding(state, { kind: 'bid-timing', enabled: true }, at('b', order, 1000))).toMatchObject({
      timed: true,
      started: false,
      deadline: null,
    });
  });

  describe('lowering', () => {
    test('takes back raises made this turn, down to the bid the faction found, and brings back the passes they cleared', () => {
      let state = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
      state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('a'));
      state = applyBidding(state, { kind: 'bid-pass', round: 1 }, at('b'));
      expect(state).toMatchObject({ turn: 'c', bid: { factionId: 'a', amount: 1 }, passed: ['b'] });
      expect(canLowerBid(state, 'c')).toBe(false);
      state = applyBidding(state, { kind: 'bid-raise', round: 1 }, at('c'));
      state = applyBidding(state, { kind: 'bid-raise', round: 1 }, at('c'));
      expect(state).toMatchObject({ bid: { factionId: 'c', amount: 3 }, passed: [] });
      state = applyBidding(state, { kind: 'bid-lower', round: 1 }, at('c'));
      expect(state).toMatchObject({ bid: { factionId: 'c', amount: 2 }, passed: [] });
      state = applyBidding(state, { kind: 'bid-lower', round: 1 }, at('c'));
      expect(state).toMatchObject({ turn: 'c', bid: { factionId: 'a', amount: 1 }, passed: ['b'] });
      expect(() => applyBidding(state, { kind: 'bid-lower', round: 1 }, at('c'))).toThrow(BiddingRefusal);
    });

    test('is refused for anyone the bidder does not point at, and for a bid the faction found', () => {
      const raised = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
      expect(() => applyBidding(raised, { kind: 'bid-lower', round: 1 }, at('b'))).toThrow(BiddingRefusal);
      expect(() => applyBidding(opened(), { kind: 'bid-lower', round: 1 }, at('a'))).toThrow(BiddingRefusal);
      expect(applyBidding(raised, { kind: 'bid-lower', round: 1 }, at('a'))).toMatchObject({ bid: null, turn: 'a' });
    });

    test('is refused in a round opened before the bidder kept where the turn started', () => {
      const { turnStart: _kept, ...older } = applyBidding(opened(), { kind: 'bid-raise', round: 1 }, at('a'));
      expect(canLowerBid(older, 'a')).toBe(false);
      expect(() => applyBidding(older, { kind: 'bid-lower', round: 1 }, at('a'))).toThrow(BiddingRefusal);
      /* Its next raise keeps the bid it found, which lowering returns to and never passes. */
      let state = applyBidding(older, { kind: 'bid-raise', round: 1 }, at('a'));
      state = applyBidding(state, { kind: 'bid-lower', round: 1 }, at('a'));
      expect(state).toMatchObject({ bid: { factionId: 'a', amount: 1 } });
      expect(canLowerBid(state, 'a')).toBe(false);
    });
  });
});
