import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS, STANDARD_PHASES } from '../../src/shared/play/phases';
import { biddingAfterTable } from './bidding';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

type Identity = Parameters<Room['command']>[0];

const bob: Identity = {
  connectionId: 'bob-connection',
  userId: 'bob-user',
  viewerSeat: 'atreides',
  displayName: 'bob',
  color: '#d0c8b9',
};
const LATER = Date.now() + 10 * PHASE_CHANGE_COOLDOWN_MS;
const BIDDING = STANDARD_PHASES.findIndex((phase) => phase.id === 'bidding');

function biddingRoom() {
  return new Room(
    { ...initialSnapshot(), phase: BIDDING, roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    () => 'atreides'
  );
}

test('a quick second raise sent against the table its first raise changed still lands', () => {
  const room = biddingRoom();
  room.accept(room.command(bob, { kind: 'bid-start', factionId: 'atreides' }, room.snapshot.revision, LATER));
  const seen = room.snapshot.revision;
  const round = room.snapshot.bidding!.round;
  room.accept(room.command(bob, { kind: 'bid-raise', round }, seen, LATER));
  room.accept(room.command(bob, { kind: 'bid-raise', round }, seen, LATER));
  expect(room.snapshot.bidding?.bid?.amount).toBe(2);
});

test('leaving the Bidding phase keeps the round count rising, so an old raise never lands in a later phase', () => {
  const room = biddingRoom();
  room.accept(room.command(bob, { kind: 'bid-start', factionId: 'atreides' }, room.snapshot.revision, LATER));
  const before = room.snapshot;
  const after = biddingAfterTable(before, { ...before, phase: BIDDING + 1 }, LATER);
  expect(after.bidding).toMatchObject({ stage: 'idle', round: before.bidding!.round });
});
