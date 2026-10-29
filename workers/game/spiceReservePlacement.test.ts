import { expect, test } from 'vite-plus/test';

import { spiceReserveActionSchema } from '../../src/shared/play/spiceReserve';
import { hostedFixturePlan } from './fixture';
import { Room } from './room';

const player = {
  connectionId: 'spice-connection',
  userId: 'spice-player',
  viewerSeat: 'atreides',
  displayName: 'Atreides',
  color: '#75d8a7',
};

function room() {
  const snapshot = hostedFixturePlan.snapshot(hostedFixturePlan.roster);
  return new Room(
    { ...snapshot, table: { ...snapshot.table, pieces: [] }, factionBanks: { atreides: 37 } },
    () => ['atreides', 'harkonnen'],
    (userId) => (userId === player.userId ? 'atreides' : undefined)
  );
}

test('a spice withdrawal lands at the chosen table point and deducts its amount once', () => {
  const table = room();
  const next = table.command(player, { kind: 'bank-withdraw', amount: 7, position: [1, 20, 2] }, 0, Date.now());
  table.accept(next);
  const spice = table.snapshot.table.pieces.find((piece) => piece.stackKey === 'spice')!;
  expect(spice.position[0]).toBe(1);
  expect(spice.position[2]).toBe(2);
  expect(spice.position[1]).toBeLessThan(1);
  expect(spice.items).toHaveLength(7);
  expect(table.snapshot.factionBanks.atreides).toBe(30);
});

test('an off-table withdrawal is refused without charging the reserve', () => {
  const table = room();
  expect(() =>
    table.command(player, { kind: 'bank-withdraw', amount: 7, position: [29, 0, 29] }, 0, Date.now())
  ).toThrow('on the table');
  expect(table.snapshot.factionBanks.atreides).toBe(37);
  expect(table.snapshot.table.pieces).toEqual([]);
});

test('positioned withdrawals preserve balance and seating checks', () => {
  const table = room();
  expect(() =>
    table.command(player, { kind: 'bank-withdraw', amount: 38, position: [1, 0, 2] }, 0, Date.now())
  ).toThrow('not enough spice');
  expect(() =>
    table.command(
      { ...player, viewerSeat: 'neutral', userId: 'observer' },
      { kind: 'bank-withdraw', amount: 1, position: [1, 0, 2] },
      0,
      Date.now()
    )
  ).toThrow();
  expect(table.snapshot.factionBanks.atreides).toBe(37);
  expect(table.snapshot.table.pieces).toEqual([]);
});

test('the wire rejects invalid spice amounts and positions while retaining legacy withdrawals', () => {
  for (const amount of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(spiceReserveActionSchema.safeParse({ kind: 'bank-withdraw', amount, position: [1, 0, 2] }).success).toBe(
      false
    );
  }
  for (const position of [
    [31, 0, 0],
    [0, Number.NaN, 0],
    [0, 0, Number.POSITIVE_INFINITY],
  ]) {
    expect(spiceReserveActionSchema.safeParse({ kind: 'bank-withdraw', amount: 1, position }).success).toBe(false);
  }
  expect(spiceReserveActionSchema.safeParse({ kind: 'bank-withdraw', amount: 1 }).success).toBe(true);
});
