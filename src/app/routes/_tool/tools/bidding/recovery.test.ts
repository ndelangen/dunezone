import { parseBiddingSnapshot } from '@shared/tools/biddingSession';
import type { BiddingPublication } from '@shared/tools/biddingSession';
import { describe, expect, it } from 'vite-plus/test';

import { applyAuctionAction, createAuction } from './auction';
import { acceptBiddingPublication, promoteSnapshot, restoreCentralSnapshot } from './recovery';
import { BiddingSession, createBiddingCommand } from './session';

function inProgress() {
  const table = new BiddingSession({
    identity: { tableId: 'table-a', code: 'DUNE42', centralInstanceId: 'instance-a', generation: 1 },
    auction: createAuction({
      ruleset: { id: 'gf9', name: 'GF9' },
      deck: { name: 'Treachery', back: '/cards/back.webp' },
      seats: ['a', 'b'].map((id) => ({
        id,
        name: id,
        src: `/tokens/${id}.webp`,
        color: '#123456',
        hand: 1,
        limit: 4,
        full: false,
        pass: false,
      })),
    }),
  });
  table.receive('phone-a', createBiddingCommand(table.getSnapshot(), 'phone-a', { type: 'assign', factionId: 'a' }));
  table.dispatch({ type: 'finish-setup' });
  table.dispatch({ type: 'start' });
  table.dispatch({ type: 'bid', amount: 3 });
  return table.getSnapshot();
}
const publication = (snapshot = inProgress()): BiddingPublication => ({
  type: 'state',
  snapshot,
  deadline: 15_000,
  sentAt: 1000,
});

describe('bidding recovery copy', () => {
  it('restores a finished setup to ready only after Resume and still waits for Start', () => {
    const previous = inProgress();
    const auction = createAuction({ seats: previous.auction.seats, ruleset: previous.auction.ruleset });
    const waiting = applyAuctionAction(auction, { type: 'finish-setup' });
    expect(waiting.accepted).toBe(true);
    const saved = { ...previous, auction: waiting.state };
    const restored = restoreCentralSnapshot(saved, 'instance-b');
    expect(restored.auction).toMatchObject({ stage: 'paused', resumeStage: 'ready', opener: null, turn: null });
    const resumed = applyAuctionAction(restored.auction, { type: 'resume' });
    expect(resumed.accepted).toBe(true);
    expect(resumed.state).toMatchObject({ stage: 'ready', opener: null, turn: null, high: null, cardsChosen: false });
    expect(applyAuctionAction(resumed.state, { type: 'start' }).state.stage).toBe('active');
    expect(parseBiddingSnapshot({ ...saved, auction: { ...waiting.state, card: 2 } })).toBeNull();
  });

  it('restores the same table paused, preserving bid, bidder, setup and assignments', () => {
    const saved = inProgress();
    const restored = restoreCentralSnapshot(JSON.parse(JSON.stringify(saved)), 'instance-b');
    expect(() => restoreCentralSnapshot(saved, saved.centralInstanceId)).toThrow('new central instance');
    expect(restored).toMatchObject({
      tableId: saved.tableId,
      code: saved.code,
      centralInstanceId: 'instance-b',
      generation: 2,
      commandSequences: {},
    });
    expect(restored.assignments).toEqual(saved.assignments);
    expect(restored.auction).toMatchObject({
      stage: 'paused',
      resumeStage: 'active',
      high: saved.auction.high,
      turn: saved.auction.turn,
      deck: saved.auction.deck,
      seats: saved.auction.seats,
    });
    const table = new BiddingSession({
      identity: restored,
      auction: restored.auction,
      assignments: restored.assignments,
      revision: restored.revision,
    });
    expect(table.dispatch({ type: 'bid', amount: 4 }).accepted).toBe(false);
    expect(table.dispatch({ type: 'resume' }).accepted).toBe(true);
    expect(table.getSnapshot().auction.opportunity).toBeGreaterThan(saved.auction.opportunity);
  });

  it('promotes to a new table while clearing assignments and prior command sequences', () => {
    const saved = inProgress();
    const promoted = promoteSnapshot(saved, { tableId: 'table-b', code: 'SAND73' }, 'new-instance');
    expect(promoted).toMatchObject({
      tableId: 'table-b',
      code: 'SAND73',
      generation: 1,
      revision: 0,
      assignments: {},
      commandSequences: {},
    });
    expect(promoted.auction.high).toEqual(saved.auction.high);
    expect(promoted.auction.stage).toBe('paused');
    expect(() => promoteSnapshot(saved, { tableId: 'table-b', code: saved.code })).toThrow(
      'new table identity and join code'
    );
  });

  it('ignores stale revisions, old instances and states from another table', () => {
    const saved = inProgress();
    const copy = { snapshot: saved, receivedAt: 100 };
    expect(
      acceptBiddingPublication(copy, publication({ ...saved, revision: saved.revision - 1 }), saved.tableId, 200)
        .accepted
    ).toBe(false);
    expect(
      acceptBiddingPublication(copy, publication({ ...saved, centralInstanceId: 'old-instance' }), saved.tableId, 200)
        .accepted
    ).toBe(false);
    expect(
      acceptBiddingPublication(copy, publication({ ...saved, tableId: 'other' }), saved.tableId, 200).accepted
    ).toBe(false);
    const newer = restoreCentralSnapshot(saved, 'instance-b');
    expect(acceptBiddingPublication(copy, publication(newer), saved.tableId, 200)).toMatchObject({
      accepted: true,
      changed: true,
    });
  });

  it('refreshes equal-revision heartbeat receipt time without replacing snapshot data', () => {
    const saved = inProgress();
    const answer = acceptBiddingPublication(
      { snapshot: saved, receivedAt: 100 },
      publication(saved),
      saved.tableId,
      200
    );
    expect(answer).toMatchObject({ accepted: true, changed: false, copy: { receivedAt: 200 } });
    expect(answer.copy?.snapshot).toBe(saved);
    const changed = { ...saved, auction: { ...saved.auction, seconds: 20 } };
    expect(acceptBiddingPublication(answer.copy, publication(changed), saved.tableId, 300).accepted).toBe(false);
  });

  it('requires a new central instance for a higher generation and rejects older generations', () => {
    const saved = inProgress();
    const newer = restoreCentralSnapshot(saved, 'instance-b');
    const newerCopy = { snapshot: newer, receivedAt: 100 };
    expect(acceptBiddingPublication(newerCopy, publication(saved), saved.tableId, 200).accepted).toBe(false);
    expect(
      acceptBiddingPublication(
        { snapshot: saved, receivedAt: 100 },
        publication({ ...newer, centralInstanceId: saved.centralInstanceId }),
        saved.tableId,
        200
      ).accepted
    ).toBe(false);
  });

  it('refuses malformed, unsupported or oversized copies without overwriting a valid copy', () => {
    const saved = inProgress();
    const copy = { snapshot: saved, receivedAt: 100 };
    for (const bad of [{}, { ...saved, version: 99 }, { ...saved, auction: { ...saved.auction, seats: [] } }]) {
      expect(parseBiddingSnapshot(bad)).toBeNull();
      const answer = acceptBiddingPublication(copy, { ...publication(), snapshot: bad }, saved.tableId, 200);
      expect(answer.copy).toBe(copy);
      expect(answer.accepted).toBe(false);
    }
    const result = { phase: 1, card: 1, factionId: 'a', name: 'a'.repeat(150), amount: 1 };
    expect(
      parseBiddingSnapshot({
        ...saved,
        auction: { ...saved.auction, results: Array.from({ length: 4096 }, () => result) },
      })
    ).toBeNull();
  });

  it('refuses paused copies missing the bidder or starter needed to resume their auction', () => {
    const saved = restoreCentralSnapshot(inProgress(), 'instance-b');
    for (const auction of [
      { ...saved.auction, turn: null },
      { ...saved.auction, opener: null },
      { ...saved.auction, card: saved.auction.cards + 1 },
      { ...saved.auction, turn: saved.auction.high!.id },
    ]) {
      expect(parseBiddingSnapshot({ ...saved, auction })).toBeNull();
    }
  });

  it('refuses contradictory waiting stages and incomplete assignment revision records', () => {
    const saved = inProgress();
    expect(parseBiddingSnapshot({ ...saved, auction: { ...saved.auction, stage: 'ready' } })).toBeNull();
    expect(parseBiddingSnapshot({ ...saved, revisions: { ...saved.revisions, deviceClaims: {} } })).toBeNull();
  });
});
