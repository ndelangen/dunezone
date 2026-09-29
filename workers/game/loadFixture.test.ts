import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import type { Viewer } from '../../src/shared/play/protocol';
import { hostedFixturePlan } from './fixture';
import { LOAD_SEATS, loadFixturePlan, loadSnapshot } from './loadFixture';
import { Room } from './room';

const player = (index: number): Viewer => ({
  connectionId: `connection-${index}`,
  userId: `user-${index}`,
  viewerSeat: LOAD_SEATS[index]!,
  displayName: `Player ${index + 1}`,
  color: '#176a73',
});

test('both content arrangements preserve item identity, and the load plan seats its eighteen players on them', () => {
  const stacked = loadSnapshot('stacked');
  const separated = loadSnapshot('separated');
  const items = (snapshot: typeof stacked) =>
    snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort();
  expect(items(stacked)).toEqual(items(separated));
  expect(new Set(items(stacked)).size).toBe(750);
  expect(stacked.table.pieces).toHaveLength(294);
  expect(separated.table.pieces).toHaveLength(750);
  const plan = loadFixturePlan('separated');
  expect(plan.hosted).toBe(false);
  expect(plan.roster.seats.map((seat) => seat.id)).toEqual(LOAD_SEATS);
  expect(plan.roster.seatCount).toBe(18);
  const first = plan.snapshot(plan.roster);
  expect(first.table.pieces).toEqual(separated.table.pieces);
  expect(first.roster).toEqual(plan.roster);
  expect(hostedFixturePlan.snapshot(hostedFixturePlan.roster).table.pieces).toEqual(initialSnapshot().table.pieces);
});

test('the peak admits eighteen distinct carries and retains the one-carry-per-connection guard', () => {
  const snapshot = loadSnapshot('stacked');
  const expanded = new Room(snapshot, () => LOAD_SEATS);
  for (let index = 0; index < 18; index++) {
    const input = {
      carryId: `carry-${index}`,
      sourcePieceId: snapshot.table.pieces[index]!.id,
      expectedVersion: 0,
      pickup: 'whole' as const,
    };
    expanded.begin(player(index), input);
  }
  expect(expanded.carries.size).toBe(18);
  expect(() =>
    expanded.begin(player(0), {
      carryId: 'second-carry',
      sourcePieceId: snapshot.table.pieces[20]!.id,
      expectedVersion: 0,
      pickup: 'whole',
    })
  ).toThrow('Finish the current carry first');
});
