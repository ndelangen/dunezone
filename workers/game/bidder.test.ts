import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { PHASE_CHANGE_COOLDOWN_MS, STANDARD_PHASES } from '../../src/shared/play/phases';
import { biddingAfterTable, biddingDeadline, expireBidding } from './bidding';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';
import { storedSnapshotSchema } from './state';

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

test('a stored auction from before optional timing loads untimed and cannot expire', () => {
  const snapshot = storedSnapshotSchema.parse({
    ...initialSnapshot(),
    phase: BIDDING,
    roster: hostedFixturePlan.roster,
    bidding: {
      seconds: 15,
      stage: 'open',
      round: 1,
      opener: 'atreides',
      turn: 'atreides',
      bid: null,
      passed: [],
      deadline: 1,
    },
  });
  expect(snapshot.bidding).toMatchObject({ timed: false, started: false });
  expect(biddingDeadline(snapshot)).toBe(0);
  expect(expireBidding(snapshot, LATER)).toBeUndefined();
});

test('a faction token flipped in hand and dropped face down turns its faction out of the bidding', () => {
  const base = initialSnapshot();
  const token = (factionId: string, x: number) => ({
    id: `token-${factionId}`,
    label: factionId,
    owner: factionId,
    color: '#000000',
    accent: '#000000',
    kind: 'force' as const,
    stackKey: `faction-token:${factionId}`,
    items: [{ id: `token-${factionId}-item`, faceUp: true }],
    position: [x, 0, 12] as [number, number, number],
    orientation: 0,
    zoneId: null,
    locked: false,
  });
  const room = new Room(
    {
      ...base,
      phase: BIDDING,
      roster: hostedFixturePlan.roster,
      table: { ...base.table, pieces: [token('harkonnen', -10), token('atreides', -7)] },
      versions: { 'token-harkonnen': 0, 'token-atreides': 0 },
    },
    () => ['harkonnen', 'atreides'],
    () => 'atreides'
  );
  room.accept(room.command(bob, { kind: 'bid-start', factionId: 'atreides' }, room.snapshot.revision, LATER));
  const round = room.snapshot.bidding!.round;
  room.accept(room.command(bob, { kind: 'bid-raise', round }, room.snapshot.revision, LATER));
  expect(room.snapshot.bidding?.stage).toBe('open');
  const harkonnen: Identity = {
    ...bob,
    connectionId: 'alice-connection',
    userId: 'alice-user',
    viewerSeat: 'harkonnen',
  };
  const asHarkonnen = new Room(
    room.snapshot,
    () => ['harkonnen', 'atreides'],
    () => 'harkonnen'
  );
  asHarkonnen.begin(harkonnen, {
    carryId: 'carry',
    sourcePieceId: 'token-harkonnen',
    expectedVersion: 0,
    pickup: 'whole',
  });
  const position = asHarkonnen.snapshot.table.pieces.find((piece) => piece.id === 'token-harkonnen')!.position;
  const next = asHarkonnen.drop(harkonnen, 'carry', { position, orientation: 0, flips: 1 });
  expect(next.table.pieces.find((piece) => piece.id === 'token-harkonnen')?.items[0]?.faceUp).toBe(false);
  expect(next.bidding?.stage).not.toBe('open');
});

test('a game in progress refuses the fixture reset', () => {
  const room = new Room(
    { ...initialSnapshot(), stage: 'play', phase: BIDDING, roster: hostedFixturePlan.roster },
    () => ['harkonnen', 'atreides'],
    () => 'atreides'
  );
  expect(() => room.command(bob, { kind: 'reset' }, room.snapshot.revision, LATER)).toThrow(
    'A game in progress cannot be reset.'
  );
});
