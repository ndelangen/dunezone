import type { AuctionAction, AuctionState, BiddingFaction } from '@shared/tools/biddingSession';
import { describe, expect, it } from 'vite-plus/test';

import { applyAuctionAction, createAuction } from './auction';

const seats = (): BiddingFaction[] =>
  ['Atreides', 'Harkonnen', 'Emperor'].map((name, index) => ({
    id: ['a', 'b', 'c'][index],
    name,
    hand: index === 1 ? 2 : 1,
    limit: 4,
    full: false,
    pass: false,
    peeks: index === 0,
    paid: index === 2,
  }));
const setup = () => createAuction({ seats: seats(), ruleset: { id: 'gf9', name: 'GF9' } });
function act(state: AuctionState, action: AuctionAction): AuctionState {
  const result = applyAuctionAction(state, action);
  expect(result.accepted, result.reason).toBe(true);
  return result.state;
}
function wonByFirst(state = setup()): AuctionState {
  let next = act(state, { type: 'start' });
  next = act(next, { type: 'bid', amount: 3 });
  next = act(next, { type: 'pass' });
  return act(next, { type: 'pass' });
}

describe('physical bidding auction', () => {
  it('uses the declared Full flag and recalculates it only when the count or limit changes', () => {
    let state = setup();
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 8 });
    expect(state.seats[0].full).toBe(true);
    state = act(state, { type: 'edit-status', id: 'a', field: 'full', value: false });
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 8 });
    expect(state.seats[0].full).toBe(false);
    state = act(state, { type: 'start' });
    expect(state.turn).toBe('a');
    state = act(state, { type: 'edit-hand', id: 'a', field: 'limit', value: 7 });
    expect(state.seats[0].full).toBe(true);
    expect(state.turn).toBe('b');
  });

  it('updates the suggested card count until chosen and freezes it for the phase', () => {
    let state = setup();
    expect(state.cards).toBe(3);
    state = act(state, { type: 'edit-status', id: 'b', field: 'full', value: true });
    expect(state.cards).toBe(2);
    state = act(state, { type: 'configure', cards: 7 });
    state = act(state, { type: 'edit-status', id: 'b', field: 'full', value: false });
    expect(state.cards).toBe(7);
    state = act(state, { type: 'start' });
    state = act(state, { type: 'edit-status', id: 'c', field: 'full', value: true });
    expect(state.cards).toBe(7);
  });

  it('allows an ordinary pass to bid again after a later raise', () => {
    let state = act(setup(), { type: 'start' });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'bid', amount: 2 });
    state = act(state, { type: 'pass' });
    expect(state.turn).toBe('a');
    expect(state.passed).toEqual(['c']);
    expect(act(state, { type: 'bid', amount: 3 }).high).toEqual({ id: 'a', amount: 3 });
  });

  it('keeps persistent pass across raises, resets, completed cards and later phases', () => {
    let state = act(setup(), { type: 'edit-status', id: 'b', field: 'pass', value: true });
    state = act(state, { type: 'configure', cards: 1 });
    state = act(state, { type: 'start' });
    state = act(state, { type: 'bid', amount: 1 });
    expect(state.turn).toBe('c');
    state = act(state, { type: 'bid', amount: 2 });
    expect(state.turn).toBe('a');
    state = act(state, { type: 'reset' });
    expect(state.seats[1].pass).toBe(true);
    state = act(state, { type: 'start' });
    expect(state.turn).toBe('c');
    state = act(state, { type: 'bid', amount: 1 });
    state = act(state, { type: 'pass' });
    expect(state.stage).toBe('over');
    state = act(state, { type: 'next-phase' });
    expect(state.seats[1].pass).toBe(true);
    expect(state.cards).toBe(3);
  });

  it('adds exactly one card and waits with the starter following the previous starter', () => {
    let state = act(setup(), { type: 'start' });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'bid', amount: 10 });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    expect(state.stage).toBe('ready');
    expect(state.starter).toBe('b');
    expect(state.seats[2].hand).toBe(2);
    expect(state.results).toEqual([{ phase: 1, card: 1, factionId: 'c', name: 'Emperor', amount: 10 }]);
    expect(state.note).toContain('Pay the bank.');
    expect(state.turn).toBeNull();
  });

  it('shows peek and payment reminders without changing card bookkeeping', () => {
    const started = act(setup(), { type: 'start' });
    expect(started.note).toBe('Atreides looks first.');
    const state = wonByFirst();
    expect(state.note).toContain('Pay Emperor.');
    expect(state.seats[0].hand).toBe(2);
  });

  it('adds only one card for Harkonnen and retains its player-chosen limit', () => {
    let state = act(setup(), { type: 'select-starter', id: 'b' });
    state = act(state, { type: 'edit-hand', id: 'b', field: 'limit', value: 8 });
    state = act(state, { type: 'start' });
    state = act(state, { type: 'bid', amount: 2 });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    expect(state.seats[1]).toMatchObject({ hand: 3, limit: 8, full: false });
  });

  it('reset abandons only the active card and manual corrections do not erase wins', () => {
    let state = wonByFirst();
    const result = state.results;
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 1 });
    state = act(state, { type: 'start' });
    state = act(state, { type: 'bid', amount: 8 });
    state = act(state, { type: 'reset' });
    expect(state).toMatchObject({ stage: 'ready', card: 2, cards: 3, high: null, passed: [], starter: 'c' });
    expect(state.results).toEqual(result);
    expect(state.seats[0].hand).toBe(1);
  });

  it('ends on an unbid all-pass auction, including persistent passes', () => {
    let state = setup();
    state = act(state, { type: 'edit-status', id: 'b', field: 'pass', value: true });
    state = act(state, { type: 'start' });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    expect(state.stage).toBe('over');
    expect(state.results).toEqual([]);
    expect(state.note).toContain('Return the unsold cards.');
  });

  it('settles an accepted bid even when its bidder later declares Full', () => {
    let state = act(setup(), { type: 'start' });
    state = act(state, { type: 'bid', amount: 5 });
    state = act(state, { type: 'edit-status', id: 'a', field: 'full', value: true });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    expect(state.results[0].factionId).toBe('a');
    expect(state.seats[0].hand).toBe(2);
  });

  it('ends immediately when the last available faction fills its hand', () => {
    let state = setup();
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 3 });
    state = act(state, { type: 'edit-status', id: 'b', field: 'full', value: true });
    state = act(state, { type: 'edit-status', id: 'c', field: 'full', value: true });
    state = act(state, { type: 'configure', cards: 10 });
    state = act(state, { type: 'start' });
    state = act(state, { type: 'bid', amount: 1 });
    expect(state.stage).toBe('over');
    expect(state.results).toHaveLength(1);
    expect(state.seats[0]).toMatchObject({ hand: 4, full: true });
  });

  it('rejects invalid amounts and stage transitions without changing state', () => {
    const state = act(setup(), { type: 'start' });
    for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(applyAuctionAction(state, { type: 'bid', amount })).toMatchObject({ accepted: false, state });
    }
    expect(applyAuctionAction(state, { type: 'start' }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'resume' }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'configure', cards: 1 }).accepted).toBe(false);
  });

  it('pauses without losing the bid and Resume creates a fresh opportunity', () => {
    let state = act(setup(), { type: 'start' });
    state = act(state, { type: 'bid', amount: 7 });
    const current = state;
    state = act(state, { type: 'pause' });
    expect(applyAuctionAction(state, { type: 'pass' }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'bid', amount: 8 }).accepted).toBe(false);
    state = act(state, { type: 'resume' });
    expect(state.high).toEqual(current.high);
    expect(state.turn).toBe(current.turn);
    expect(state.opportunity).toBeGreaterThan(current.opportunity);
  });
});
