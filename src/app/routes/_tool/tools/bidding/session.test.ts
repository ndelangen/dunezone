import type { BiddingAction, BiddingCommand } from '@shared/tools/biddingSession';
import { describe, expect, it } from 'vite-plus/test';

import { createAuction } from './auction';
import { BiddingSession, createBiddingCommand } from './session';

function session() {
  return new BiddingSession({
    identity: { tableId: 'table-a', code: 'DUNE42', centralInstanceId: 'instance-a', generation: 1 },
    auction: createAuction({
      ruleset: { id: 'gf9', name: 'GF9' },
      seats: ['a', 'b', 'c'].map((id) => ({ id, name: id, hand: 1, limit: 4, full: false, pass: false })),
    }),
  });
}
function request(table: BiddingSession, device: string, action: BiddingAction): BiddingCommand {
  return createBiddingCommand(table.getSnapshot(), device, action);
}
function remote(table: BiddingSession, device: string, action: BiddingAction) {
  return table.receive(device, request(table, device, action));
}
function started() {
  const table = session();
  expect(remote(table, 'phone-a', { type: 'assign', factionId: 'a' }).accepted).toBe(true);
  expect(table.dispatch({ type: 'finish-setup' }).accepted).toBe(true);
  expect(table.dispatch({ type: 'start' }).accepted).toBe(true);
  return table;
}

describe('bidding command authority', () => {
  it('lets assigned remotes select and start the first and later phases after central setup', () => {
    const table = session();
    expect(remote(table, 'phone-a', { type: 'assign', factionId: 'a' }).accepted).toBe(true);
    expect(remote(table, 'phone-a', { type: 'finish-setup' }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'start' }).accepted).toBe(false);
    expect(table.dispatch({ type: 'configure', cards: 1 }).accepted).toBe(true);
    expect(table.dispatch({ type: 'finish-setup' }).accepted).toBe(true);
    expect(remote(table, 'unassigned', { type: 'start' }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'configure', cards: 2 }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'select-starter', id: 'b' }).accepted).toBe(true);
    expect(remote(table, 'phone-a', { type: 'start' }).accepted).toBe(true);
    expect(table.getSnapshot().auction.turn).toBe('b');
    table.dispatch({ type: 'bid', amount: 2 });
    table.dispatch({ type: 'pass' });
    table.dispatch({ type: 'pass' });
    expect(table.getSnapshot().auction.stage).toBe('over');
    expect(remote(table, 'unassigned', { type: 'next-phase' }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'next-phase' }).accepted).toBe(true);
    expect(table.getSnapshot().auction).toMatchObject({ stage: 'ready', phase: 2, turn: null });
    expect(remote(table, 'phone-a', { type: 'select-starter', id: 'c' }).accepted).toBe(true);
    expect(remote(table, 'phone-a', { type: 'start' }).accepted).toBe(true);
    expect(table.getSnapshot().auction).toMatchObject({ stage: 'active', turn: 'c', phase: 2 });
    expect(table.getSnapshot().auction.results).toHaveLength(1);
  });

  it('rejects old setup commands and accepts only one competing start for the ready table', () => {
    const table = session();
    remote(table, 'phone-a', { type: 'assign', factionId: 'a' });
    remote(table, 'phone-b', { type: 'assign', factionId: 'b' });
    const oldStart = request(table, 'phone-a', { type: 'start' });
    const setupContext = table.captureContext();
    table.dispatch({ type: 'configure', seconds: 20 });
    expect(table.dispatch({ type: 'finish-setup' }, setupContext).accepted).toBe(false);
    expect(table.getSnapshot().auction.stage).toBe('setup');
    table.dispatch({ type: 'finish-setup' });
    expect(table.receive('phone-a', oldStart).accepted).toBe(false);
    const first = request(table, 'phone-a', { type: 'start' });
    const second = request(table, 'phone-b', { type: 'start' });
    expect(table.receive('phone-a', first).accepted).toBe(true);
    expect(table.receive('phone-b', second).accepted).toBe(false);
    expect(table.getSnapshot().auction).toMatchObject({ stage: 'active', turn: 'a', high: null });
  });

  it('accepts one of competing phone, tablet, voice and timer actions for the captured opportunity', () => {
    const table = started();
    const context = table.captureContext();
    const phone = request(table, 'phone-a', { type: 'bid', amount: 5 });
    expect(table.dispatch({ type: 'pass' }, context).accepted).toBe(true);
    expect(table.receive('phone-a', phone).accepted).toBe(false);
    expect(table.dispatch({ type: 'bid', amount: 6 }, context).accepted).toBe(false);
    expect(table.dispatch({ type: 'pass' }, context).accepted).toBe(false);
    expect(table.getSnapshot().auction).toMatchObject({ turn: 'b', high: null, passed: ['a'] });
  });

  it('leaves the opportunity open after invalid input', () => {
    const table = started();
    const context = table.captureContext();
    const invalid = { ...request(table, 'phone-a', { type: 'bid', amount: 1 }), action: { type: 'bid', amount: 1.5 } };
    expect(table.receive('phone-a', invalid)).toMatchObject({ accepted: false, commandId: invalid.commandId });
    expect(table.captureContext()).toEqual(context);
    expect(table.dispatch({ type: 'bid', amount: 3 }, context).accepted).toBe(true);
  });

  it('returns the original outcome after a lost acknowledgement without applying a command twice', () => {
    const table = started();
    const command = request(table, 'phone-a', { type: 'bid', amount: 5 });
    const accepted = table.receive('phone-a', command);
    const revision = table.getSnapshot().revision;
    expect(table.receive('phone-a', command)).toEqual(accepted);
    expect(table.getSnapshot().revision).toBe(revision);
    expect(table.getSnapshot().auction.high).toEqual({ id: 'a', amount: 5 });
  });

  it('rejects an old timer or recognition batch even when its faction gets another turn', () => {
    const table = started();
    const captured = table.captureContext();
    table.dispatch({ type: 'bid', amount: 1 });
    table.dispatch({ type: 'bid', amount: 2 });
    table.dispatch({ type: 'bid', amount: 3 });
    expect(table.getSnapshot().auction.turn).toBe('a');
    expect(table.dispatch({ type: 'pass' }, captured).accepted).toBe(false);
    expect(table.getSnapshot().auction.turn).toBe('a');
  });

  it('rejects a delayed hand edit first delivered after a win instead of overwriting the added card', () => {
    const table = started();
    const delayed = request(table, 'phone-a', { type: 'edit-hand', id: 'a', field: 'hand', value: 0 });
    table.dispatch({ type: 'bid', amount: 1 });
    table.dispatch({ type: 'pass' });
    table.dispatch({ type: 'pass' });
    expect(table.getSnapshot().auction.seats[0].hand).toBe(2);
    expect(table.receive('phone-a', delayed).accepted).toBe(false);
    expect(table.getSnapshot().auction.seats[0].hand).toBe(2);
  });

  it('refuses conflicting field edits from an old revision but accepts unrelated factions and fields', () => {
    const table = started();
    const context = table.captureContext();
    table.dispatch({ type: 'edit-hand', id: 'a', field: 'hand', value: 2 }, context);
    expect(table.dispatch({ type: 'edit-hand', id: 'a', field: 'hand', value: 3 }, context).accepted).toBe(false);
    expect(table.dispatch({ type: 'edit-hand', id: 'b', field: 'hand', value: 2 }, context).accepted).toBe(true);
    expect(table.dispatch({ type: 'edit-hand', id: 'a', field: 'limit', value: 5 }, context).accepted).toBe(true);
    expect(
      table
        .getSnapshot()
        .auction.seats.slice(0, 2)
        .map((seat) => seat.hand)
    ).toEqual([2, 2]);
    expect(table.getSnapshot().auction.seats[0].limit).toBe(5);
  });

  it('refuses an old Full override after a count edit even when Full has the same boolean value', () => {
    const table = started();
    const context = table.captureContext();
    table.dispatch({ type: 'edit-hand', id: 'a', field: 'hand', value: 2 });
    expect(table.getSnapshot().auction.seats[0].full).toBe(false);
    expect(table.dispatch({ type: 'edit-status', id: 'a', field: 'full', value: true }, context).accepted).toBe(false);
  });

  it('rejects a delayed first claim after another remote takes that faction, including ownership returning to empty', () => {
    const table = session();
    const delayed = request(table, 'phone-a', { type: 'assign', factionId: 'a' });
    expect(remote(table, 'phone-b', { type: 'assign', factionId: 'a' }).accepted).toBe(true);
    expect(table.receive('phone-a', delayed).accepted).toBe(false);
    expect(table.getSnapshot().assignments).toEqual({ 'phone-b': 'a' });

    const old = request(table, 'phone-c', { type: 'assign', factionId: 'b' });
    remote(table, 'phone-d', { type: 'assign', factionId: 'b' });
    remote(table, 'phone-d', { type: 'assign', factionId: null });
    expect(table.receive('phone-c', old).accepted).toBe(false);
    expect(table.getSnapshot().assignments).toEqual({ 'phone-b': 'a' });
    expect(remote(table, 'phone-c', { type: 'assign', factionId: 'b' }).accepted).toBe(true);
  });

  it("rejects a displaced device's old first selection without blocking another faction's claim", () => {
    const table = session();
    remote(table, 'phone-a', { type: 'assign', factionId: 'a' });
    const delayed = request(table, 'phone-a', { type: 'assign', factionId: 'b' });
    const unrelated = request(table, 'phone-c', { type: 'assign', factionId: 'c' });
    remote(table, 'phone-b', { type: 'assign', factionId: 'a' });
    expect(table.receive('phone-a', delayed).accepted).toBe(false);
    expect(table.receive('phone-c', unrelated).accepted).toBe(true);
    expect(table.getSnapshot().assignments).toEqual({ 'phone-b': 'a', 'phone-c': 'c' });
  });

  it('refuses delayed whole-seat configuration after a manual hand change', () => {
    const table = session();
    const context = table.captureContext();
    const seats = table.getSnapshot().auction.seats;
    table.dispatch({ type: 'edit-hand', id: 'b', field: 'hand', value: 3 });
    expect(table.dispatch({ type: 'configure', seats: [...seats].reverse() }, context).accepted).toBe(false);
    expect(table.getSnapshot().auction.seats[1].hand).toBe(3);
  });

  it('derives a phone faction from assignment and limits hand edits to that faction', () => {
    const table = started();
    expect(remote(table, 'phone-a', { type: 'edit-hand', id: 'b', field: 'hand', value: 10 }).accepted).toBe(false);
    expect(remote(table, 'unassigned', { type: 'bid', amount: 4 }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'configure', cards: 10 }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'edit-hand', id: 'a', field: 'hand', value: 0 }).accepted).toBe(true);
    table.dispatch({ type: 'pass' });
    expect(remote(table, 'phone-a', { type: 'bid', amount: 4 }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'edit-status', id: 'a', field: 'pass', value: true }).accepted).toBe(true);
  });

  it('replaces a faction remote and requires deliberate selection to reclaim it', () => {
    const table = started();
    const firstSelection = request(table, 'phone-a', { type: 'assign', factionId: 'a' });
    table.receive('phone-a', firstSelection);
    remote(table, 'phone-b', { type: 'assign', factionId: 'a' });
    expect(table.getSnapshot().assignments).toEqual({ 'phone-b': 'a' });
    expect(table.receive('phone-a', firstSelection).accepted).toBe(true);
    expect(table.getSnapshot().assignments).toEqual({ 'phone-b': 'a' });
    expect(remote(table, 'phone-a', { type: 'bid', amount: 1 }).accepted).toBe(false);
    expect(remote(table, 'phone-a', { type: 'assign', factionId: 'a' }).accepted).toBe(true);
    expect(table.getSnapshot().assignments).toEqual({ 'phone-a': 'a' });
  });

  it('rejects wrong table, old generation and closed central callbacks', () => {
    const table = started();
    const command = request(table, 'phone-a', { type: 'bid', amount: 1 });
    expect(table.receive('phone-a', { ...command, tableId: 'other' }).accepted).toBe(false);
    expect(table.receive('phone-a', { ...command, generation: 2 }).accepted).toBe(false);
    expect(table.receive('phone-a', { ...command, centralInstanceId: 'other' }).accepted).toBe(false);
    table.close();
    expect(table.dispatch({ type: 'bid', amount: 2 }).accepted).toBe(false);
    expect(table.receive('phone-a', command).accepted).toBe(false);
  });

  it('never reapplies an evicted receipt and never reuses a recent command identity', () => {
    const table = session();
    const first = request(table, 'phone-a', { type: 'assign', factionId: 'a' });
    table.receive('phone-a', first);
    const reused = {
      ...request(table, 'phone-a', { type: 'edit-hand', id: 'a', field: 'hand', value: 2 }),
      commandId: first.commandId,
    };
    expect(table.receive('phone-a', reused).accepted).toBe(false);
    for (let index = 0; index < 140; index += 1) {
      remote(table, 'phone-a', { type: 'edit-hand', id: 'a', field: 'hand', value: index });
    }
    const before = table.getSnapshot();
    expect(table.receive('phone-a', first).accepted).toBe(false);
    expect(table.getSnapshot()).toBe(before);
  });

  it('publishes state before notifying listeners and returns a matching result revision', () => {
    const table = started();
    const seen: number[] = [];
    const stop = table.subscribe(() => seen.push(table.getSnapshot().revision));
    const result = table.dispatch({ type: 'bid', amount: 1 });
    expect(seen).toEqual([result.revision]);
    expect(table.getSnapshot().auction.high?.amount).toBe(1);
    stop();
    table.dispatch({ type: 'pass' });
    expect(seen).toHaveLength(1);
  });
});

describe('moderator command authority', () => {
  function moderated() {
    const table = session();
    expect(table.dispatch({ type: 'finish-setup' }).accepted).toBe(true);
    expect(remote(table, 'moderator', { type: 'claim-moderator' }).accepted).toBe(true);
    expect(remote(table, 'moderator', { type: 'start' }).accepted).toBe(true);
    return table;
  }

  it('lets an unassigned phone claim moderation and releases only its own faction assignment', () => {
    const table = session();
    remote(table, 'phone-a', { type: 'assign', factionId: 'a' });
    remote(table, 'phone-b', { type: 'assign', factionId: 'b' });
    expect(remote(table, 'phone-a', { type: 'claim-moderator' }).accepted).toBe(true);
    expect(table.getSnapshot()).toMatchObject({
      moderatorDeviceId: 'phone-a',
      assignments: { 'phone-b': 'b' },
      auction: { controlMode: 'manual' },
    });
    expect(table.getSnapshot().assignments['phone-a']).toBeUndefined();
    expect(table.dispatch({ type: 'claim-moderator' }).accepted).toBe(false);
  });

  it('allows only the current moderator or central to drive a manual auction', () => {
    const table = moderated();
    remote(table, 'player', { type: 'assign', factionId: 'a' });
    for (const action of [
      { type: 'raise-one' },
      { type: 'advance' },
      { type: 'back' },
      { type: 'reset' },
      { type: 'end-phase' },
      { type: 'bid', amount: 2 },
      { type: 'pass' },
    ] as const) {
      expect(remote(table, 'player', action).accepted, action.type).toBe(false);
    }
    expect(remote(table, 'player', { type: 'edit-hand', id: 'a', field: 'hand', value: 8 }).accepted).toBe(true);
    expect(table.getSnapshot().auction.turn).toBe('a');
    expect(remote(table, 'moderator', { type: 'raise-one' }).accepted).toBe(true);
    expect(table.dispatch({ type: 'advance' }).accepted).toBe(true);
    expect(remote(table, 'moderator', { type: 'back' }).accepted).toBe(true);
    expect(table.dispatch({ type: 'bid', amount: 2 }).accepted).toBe(false);
    expect(table.dispatch({ type: 'pass' }).accepted).toBe(false);
    expect(remote(table, 'player', { type: 'confirm-winner' }).accepted).toBe(false);
  });

  it('fences a delayed first claim and old moderator controls after an explicit takeover', () => {
    const table = moderated();
    const delayed = request(table, 'late-phone', { type: 'claim-moderator' });
    const oldRaise = request(table, 'moderator', { type: 'raise-one' });
    expect(remote(table, 'replacement', { type: 'claim-moderator' }).accepted).toBe(true);
    expect(table.receive('late-phone', delayed).accepted).toBe(false);
    expect(table.receive('moderator', oldRaise).accepted).toBe(false);
    expect(remote(table, 'moderator', { type: 'raise-one' }).accepted).toBe(false);
    expect(table.getSnapshot().moderatorDeviceId).toBe('replacement');
    expect(remote(table, 'replacement', { type: 'raise-one' }).accepted).toBe(true);
    expect(table.getSnapshot().auction.high).toEqual({ id: 'a', amount: 1 });
  });

  it('applies retries once and prevents a delayed confirmation from awarding another card', () => {
    const table = moderated();
    const raise = request(table, 'moderator', { type: 'raise-one' });
    const raised = table.receive('moderator', raise);
    expect(raised.accepted).toBe(true);
    expect(table.receive('moderator', raise)).toEqual(raised);
    expect(table.getSnapshot().auction.high?.amount).toBe(1);
    const confirm = request(table, 'moderator', { type: 'confirm-winner' });
    const confirmed = table.receive('moderator', confirm);
    expect(confirmed.accepted).toBe(true);
    expect(table.receive('moderator', confirm)).toEqual(confirmed);
    expect(table.getSnapshot().auction.seats[0].hand).toBe(2);
    expect(table.getSnapshot().auction.results).toHaveLength(1);
    remote(table, 'moderator', { type: 'start' });
    remote(table, 'moderator', { type: 'raise-one' });
    const late = { ...request(table, 'moderator', { type: 'confirm-winner' }), opportunity: confirm.opportunity };
    expect(table.receive('moderator', late).accepted).toBe(false);
    expect(table.getSnapshot().auction.results).toHaveLength(1);
  });

  it('rejects controls captured before a raise even when its pointer did not move', () => {
    const table = moderated();
    const context = table.captureContext();
    expect(remote(table, 'moderator', { type: 'raise-one' }).accepted).toBe(true);
    expect(table.getSnapshot().auction.turn).toBe('a');
    expect(table.dispatch({ type: 'advance' }, context).accepted).toBe(false);
    expect(table.dispatch({ type: 'confirm-winner' }, context).accepted).toBe(false);
    expect(table.getSnapshot().auction.results).toEqual([]);
  });

  it('keeps manual control when the moderator releases or returns to a faction', () => {
    const table = moderated();
    remote(table, 'moderator', { type: 'raise-one' });
    expect(remote(table, 'other', { type: 'release-moderator' }).accepted).toBe(false);
    expect(remote(table, 'moderator', { type: 'release-moderator' }).accepted).toBe(true);
    expect(table.getSnapshot()).toMatchObject({
      moderatorDeviceId: null,
      auction: { controlMode: 'manual', high: { id: 'a', amount: 1 } },
    });
    expect(remote(table, 'moderator', { type: 'advance' }).accepted).toBe(false);
    expect(table.dispatch({ type: 'advance' }).accepted).toBe(true);
    remote(table, 'moderator', { type: 'claim-moderator' });
    const old = request(table, 'moderator', { type: 'raise-one' });
    expect(remote(table, 'moderator', { type: 'assign', factionId: 'c' }).accepted).toBe(true);
    expect(table.getSnapshot()).toMatchObject({
      moderatorDeviceId: null,
      assignments: { moderator: 'c' },
      auction: { controlMode: 'manual' },
    });
    expect(table.receive('moderator', old).accepted).toBe(false);
  });

  it('returns to automatic only between auctions and clears the moderator claim', () => {
    const table = moderated();
    remote(table, 'moderator', { type: 'raise-one' });
    expect(remote(table, 'moderator', { type: 'set-control-mode', mode: 'automatic' }).accepted).toBe(false);
    expect(table.dispatch({ type: 'set-control-mode', mode: 'automatic' }).accepted).toBe(false);
    expect(table.getSnapshot().auction.results).toEqual([]);
    remote(table, 'moderator', { type: 'reset' });
    expect(remote(table, 'moderator', { type: 'set-control-mode', mode: 'automatic' }).accepted).toBe(true);
    expect(table.getSnapshot()).toMatchObject({
      moderatorDeviceId: null,
      auction: { controlMode: 'automatic', stage: 'ready', high: null },
    });
    expect(table.dispatch({ type: 'start' }).accepted).toBe(true);
    expect(table.dispatch({ type: 'bid', amount: 2 }).accepted).toBe(true);
  });
});
