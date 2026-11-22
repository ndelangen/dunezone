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
function startAuction(state: AuctionState): AuctionState {
  const ready = state.stage === 'setup' ? act(state, { type: 'finish-setup' }) : state;
  return act(ready, { type: 'start' });
}
function wonByFirst(state = setup()): AuctionState {
  let next = startAuction(state);
  next = act(next, { type: 'bid', amount: 3 });
  next = act(next, { type: 'pass' });
  return act(next, { type: 'pass' });
}

describe('physical bidding auction', () => {
  it('finishes setup without starting an auction or freezing the suggested card count', () => {
    const initial = setup();
    expect(applyAuctionAction(initial, { type: 'start' }).accepted).toBe(false);
    let state = act(initial, { type: 'finish-setup' });
    expect(state).toMatchObject({ stage: 'ready', turn: null, high: null, opener: null, card: 1, cardsChosen: false });
    expect(state.opportunity).toBeGreaterThan(initial.opportunity);
    expect(applyAuctionAction(state, { type: 'finish-setup' }).accepted).toBe(false);
    state = act(state, { type: 'edit-status', id: 'b', field: 'full', value: true });
    expect(state.cards).toBe(2);
    state = act(state, { type: 'select-starter', id: 'c' });
    state = act(state, { type: 'start' });
    expect(state).toMatchObject({ stage: 'active', turn: 'c', opener: 'c', cards: 2, cardsChosen: true });
  });

  it('allows phase settings before its first auction while keeping the finished table setup fixed', () => {
    let state = act(setup(), { type: 'finish-setup' });
    state = act(state, { type: 'configure', cards: 7, seconds: 20 });
    expect(state).toMatchObject({ cards: 7, cardsChosen: true, seconds: 20 });
    for (const action of [
      { type: 'configure', seats: [...state.seats].reverse() },
      { type: 'configure', ruleset: { id: 'other', name: 'Other' } },
      { type: 'configure', deck: null },
    ] as const) {
      expect(applyAuctionAction(state, action).accepted).toBe(false);
    }
    state = act(state, { type: 'start' });
    state = act(state, { type: 'reset' });
    expect(applyAuctionAction(state, { type: 'configure', cards: 2 }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'configure', seconds: 0 }).accepted).toBe(false);
  });

  it('waits for an explicit start when no cards are suggested', () => {
    let state = setup();
    for (const seat of state.seats) {
      state = act(state, { type: 'edit-status', id: seat.id, field: 'full', value: true });
    }
    state = act(state, { type: 'finish-setup' });
    expect(state).toMatchObject({ stage: 'ready', cards: 0, turn: null });
    expect(act(state, { type: 'start' }).stage).toBe('over');
  });

  it('prepares later phases without repeating setup and preserves completed wins and seats', () => {
    let state = wonByFirst(act(setup(), { type: 'configure', cards: 1 }));
    state = act(state, { type: 'edit-status', id: 'b', field: 'full', value: true });
    const completed = state;
    state = act(state, { type: 'next-phase' });
    expect(state).toMatchObject({
      stage: 'ready',
      phase: 2,
      card: 1,
      cards: 2,
      cardsChosen: false,
      turn: null,
      opener: null,
      starter: 'c',
    });
    expect(state.seats).toEqual(completed.seats);
    expect(state.results).toEqual(completed.results);
    expect(state.ruleset).toEqual(completed.ruleset);
    expect(state.deck).toEqual(completed.deck);
    state = act(state, { type: 'edit-status', id: 'b', field: 'full', value: false });
    expect(state.cards).toBe(3);
    state = act(state, { type: 'configure', cards: 5, seconds: 0 });
    expect(act(state, { type: 'start' })).toMatchObject({ stage: 'active', cards: 5, seconds: 0 });
  });

  it('uses the declared Full flag and recalculates it only when the count or limit changes', () => {
    let state = setup();
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 8 });
    expect(state.seats[0].full).toBe(true);
    state = act(state, { type: 'edit-status', id: 'a', field: 'full', value: false });
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 8 });
    expect(state.seats[0].full).toBe(false);
    state = startAuction(state);
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
    state = startAuction(state);
    state = act(state, { type: 'edit-status', id: 'c', field: 'full', value: true });
    expect(state.cards).toBe(7);
  });

  it('allows an ordinary pass to bid again after a later raise', () => {
    let state = startAuction(setup());
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
    state = startAuction(state);
    state = act(state, { type: 'bid', amount: 1 });
    expect(state.turn).toBe('c');
    state = act(state, { type: 'bid', amount: 2 });
    expect(state.turn).toBe('a');
    state = act(state, { type: 'reset' });
    expect(state.seats[1].pass).toBe(true);
    state = startAuction(state);
    expect(state.turn).toBe('c');
    state = act(state, { type: 'bid', amount: 1 });
    state = act(state, { type: 'pass' });
    expect(state.stage).toBe('over');
    state = act(state, { type: 'next-phase' });
    expect(state.seats[1].pass).toBe(true);
    expect(state.cards).toBe(3);
  });

  it('adds exactly one card and waits with the starter following the previous starter', () => {
    let state = startAuction(setup());
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
    const started = startAuction(setup());
    expect(started.note).toBe('Atreides looks first.');
    const state = wonByFirst();
    expect(state.note).toContain('Pay Emperor.');
    expect(state.seats[0].hand).toBe(2);
  });

  it('adds only one card for Harkonnen and retains its player-chosen limit', () => {
    let state = act(setup(), { type: 'select-starter', id: 'b' });
    state = act(state, { type: 'edit-hand', id: 'b', field: 'limit', value: 8 });
    state = startAuction(state);
    state = act(state, { type: 'bid', amount: 2 });
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    expect(state.seats[1]).toMatchObject({ hand: 3, limit: 8, full: false });
  });

  it('reset abandons only the active card and manual corrections do not erase wins', () => {
    let state = wonByFirst();
    const result = state.results;
    state = act(state, { type: 'edit-hand', id: 'a', field: 'hand', value: 1 });
    state = startAuction(state);
    state = act(state, { type: 'bid', amount: 8 });
    state = act(state, { type: 'reset' });
    expect(state).toMatchObject({ stage: 'ready', card: 2, cards: 3, high: null, passed: [], starter: 'c' });
    expect(state.results).toEqual(result);
    expect(state.seats[0].hand).toBe(1);
  });

  it('ends on an unbid all-pass auction, including persistent passes', () => {
    let state = setup();
    state = act(state, { type: 'edit-status', id: 'b', field: 'pass', value: true });
    state = startAuction(state);
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'pass' });
    expect(state.stage).toBe('over');
    expect(state.results).toEqual([]);
    expect(state.note).toContain('Return the unsold cards.');
  });

  it('settles an accepted bid even when its bidder later declares Full', () => {
    let state = startAuction(setup());
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
    state = startAuction(state);
    state = act(state, { type: 'bid', amount: 1 });
    expect(state.stage).toBe('over');
    expect(state.results).toHaveLength(1);
    expect(state.seats[0]).toMatchObject({ hand: 4, full: true });
  });

  it('rejects invalid amounts and stage transitions without changing state', () => {
    const state = startAuction(setup());
    for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(applyAuctionAction(state, { type: 'bid', amount })).toMatchObject({ accepted: false, state });
    }
    expect(applyAuctionAction(state, { type: 'start' }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'resume' }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'configure', cards: 1 }).accepted).toBe(false);
  });

  it('pauses without losing the bid and Resume creates a fresh opportunity', () => {
    let state = startAuction(setup());
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

describe('manual bidding auction', () => {
  const manual = (state = setup()) => act(state, { type: 'claim-moderator' });

  it('includes every seat in its suggestion and pointer cycle even when all hands are Full or Always pass', () => {
    let state = setup();
    for (const seat of state.seats) {
      state = act(state, { type: 'edit-hand', id: seat.id, field: 'hand', value: 8 });
      state = act(state, { type: 'edit-status', id: seat.id, field: 'pass', value: true });
    }
    expect(state.cards).toBe(0);
    state = manual(state);
    expect(state.cards).toBe(3);
    state = startAuction(state);
    expect(state.turn).toBe('a');
    state = act(state, { type: 'back' });
    expect(state.turn).toBe('c');
    state = act(state, { type: 'advance' });
    expect(state.turn).toBe('a');
    state = act(state, { type: 'advance' });
    expect(state.turn).toBe('b');
    expect(state).toMatchObject({ stage: 'active', results: [], passed: [], high: null });
    expect(applyAuctionAction(state, { type: 'bid', amount: 1 }).accepted).toBe(false);
    expect(applyAuctionAction(state, { type: 'pass' }).accepted).toBe(false);
  });

  it('raises the global high amount for the pointed faction without moving or automatically awarding', () => {
    let state = startAuction(manual());
    const opportunity = state.opportunity;
    state = act(state, { type: 'raise-one' });
    state = act(state, { type: 'raise-one' });
    expect(state).toMatchObject({ turn: 'a', high: { id: 'a', amount: 2 } });
    expect(state.opportunity).toBe(opportunity + 2);
    state = act(state, { type: 'advance' });
    expect(state.high).toEqual({ id: 'a', amount: 2 });
    state = act(state, { type: 'raise-one' });
    expect(state).toMatchObject({ turn: 'b', high: { id: 'b', amount: 3 } });
    for (let index = 0; index < 3; index++) {
      state = act(state, { type: 'advance' });
    }
    expect(state).toMatchObject({ stage: 'active', turn: 'b', high: { id: 'b', amount: 3 }, results: [] });
    state = act(state, { type: 'back' });
    expect(state.turn).toBe('a');
    state = act(state, { type: 'confirm-winner' });
    expect(state.results).toEqual([{ phase: 1, card: 1, factionId: 'b', name: 'Harkonnen', amount: 3 }]);
    expect(state.seats[1].hand).toBe(3);
    expect(state).toMatchObject({ stage: 'ready', card: 2, starter: 'b', high: null, turn: null });
  });

  it('keeps hand edits, Resume and wins from applying Full or Always pass progression', () => {
    let state = startAuction(manual());
    state = act(state, { type: 'raise-one' });
    for (const seat of state.seats) {
      state = act(state, { type: 'edit-hand', id: seat.id, field: 'hand', value: 8 });
      state = act(state, { type: 'edit-status', id: seat.id, field: 'pass', value: true });
    }
    expect(state).toMatchObject({ turn: 'a', high: { id: 'a', amount: 1 }, stage: 'active', results: [] });
    state = act(state, { type: 'pause' });
    state = act(state, { type: 'resume' });
    expect(state).toMatchObject({ turn: 'a', high: { id: 'a', amount: 1 }, stage: 'active', results: [] });
    state = act(state, { type: 'confirm-winner' });
    expect(state.seats[0]).toMatchObject({ hand: 9, full: true, limit: 4, pass: true });
    expect(state.stage).toBe('ready');
    expect(state.card).toBe(2);
  });

  it('takes over an active auction without losing its accepted high bid, pointer or chosen phase count', () => {
    let state = startAuction(act(setup(), { type: 'configure', cards: 7 }));
    state = act(state, { type: 'pass' });
    state = act(state, { type: 'bid', amount: 5 });
    state = act(state, { type: 'pass' });
    const automatic = state;
    state = manual(state);
    expect(state).toMatchObject({ turn: automatic.turn, high: automatic.high, cards: 7, passed: [], stage: 'active' });
    expect(state.opportunity).toBe(automatic.opportunity + 1);
    expect(applyAuctionAction(state, { type: 'set-control-mode', mode: 'automatic' }).accepted).toBe(false);
    state = act(state, { type: 'release-moderator' });
    expect(state).toMatchObject({ controlMode: 'manual', turn: automatic.turn, high: automatic.high });
  });

  it('resets only the current auction and can select any Full faction before restarting', () => {
    let state = startAuction(manual());
    state = act(state, { type: 'raise-one' });
    state = act(state, { type: 'confirm-winner' });
    const prior = state;
    state = act(state, { type: 'start' });
    state = act(state, { type: 'raise-one' });
    state = act(state, { type: 'reset' });
    state = act(state, { type: 'edit-status', id: 'c', field: 'full', value: true });
    state = act(state, { type: 'select-starter', id: 'c' });
    expect(state).toMatchObject({ stage: 'ready', card: 2, cards: 3, turn: null, high: null });
    expect(state.results).toEqual(prior.results);
    state = act(state, { type: 'start' });
    expect(state).toMatchObject({ stage: 'active', turn: 'c', opener: 'c' });
  });

  it('ends an unsold phase only explicitly and never discards a recorded high bid', () => {
    let state = startAuction(manual());
    for (let index = 0; index < 6; index++) {
      state = act(state, { type: 'advance' });
    }
    expect(state).toMatchObject({ stage: 'active', high: null, results: [] });
    expect(applyAuctionAction(state, { type: 'confirm-winner' }).accepted).toBe(false);
    expect(act(state, { type: 'end-phase' })).toMatchObject({ stage: 'over', results: [] });
    state = act(state, { type: 'raise-one' });
    expect(applyAuctionAction(state, { type: 'end-phase' }).accepted).toBe(false);
    state = act(state, { type: 'reset' });
    expect(act(state, { type: 'end-phase' })).toMatchObject({ stage: 'over', results: [] });
  });

  it('returns to automatic between auctions and restores its eligibility suggestion without a hidden win', () => {
    let state = manual();
    state = act(state, { type: 'edit-status', id: 'a', field: 'full', value: true });
    expect(state.cards).toBe(3);
    state = act(state, { type: 'finish-setup' });
    state = act(state, { type: 'set-control-mode', mode: 'automatic' });
    expect(state).toMatchObject({ controlMode: 'automatic', cards: 2, stage: 'ready', results: [] });
    expect(act(state, { type: 'start' }).turn).toBe('b');
  });

  it('keeps manual mode for later phases and respects the chosen phase count', () => {
    let state = startAuction(manual(act(setup(), { type: 'configure', cards: 1 })));
    state = act(state, { type: 'raise-one' });
    state = act(state, { type: 'confirm-winner' });
    expect(state.stage).toBe('over');
    state = act(state, { type: 'next-phase' });
    expect(state).toMatchObject({ controlMode: 'manual', stage: 'ready', phase: 2, cards: 3, cardsChosen: false });
    expect(state.results).toHaveLength(1);
  });

  it('rejects a raise beyond the representable amount without moving the pointer or changing its bid', () => {
    const state = {
      ...startAuction(manual()),
      high: { id: 'a', amount: Number.MAX_SAFE_INTEGER - 1 },
    };
    expect(applyAuctionAction(state, { type: 'raise-one' })).toMatchObject({ accepted: false, state });
  });
});
