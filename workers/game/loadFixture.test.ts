import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import { LOAD_SEATS, loadSnapshot } from '../../src/shared/play/loadFixture';
import type { Viewer } from '../../src/shared/play/protocol';
import { Room } from './room';

const player = (index: number): Viewer => ({
  connectionId: `connection-${index}`,
  userId: `user-${index}`,
  viewerSeat: LOAD_SEATS[index]!,
  displayName: `Player ${index + 1}`,
  color: '#176a73',
});

test('both content arrangements preserve item identity and the load profile survives reset', () => {
  const stacked = loadSnapshot('stacked');
  const separated = loadSnapshot('separated');
  const items = (snapshot: typeof stacked) =>
    snapshot.table.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort();
  expect(items(stacked)).toEqual(items(separated));
  expect(new Set(items(stacked)).size).toBe(750);
  expect(stacked.table.pieces).toHaveLength(294);
  expect(separated.table.pieces).toHaveLength(750);
  const room = new Room(stacked, 'stacked');
  const reset = room.command(player(0), { kind: 'reset' }, stacked.revision);
  expect(items(reset)).toEqual(items(stacked));
  expect(reset.table.pieces).toEqual(stacked.table.pieces);
  expect(initialSnapshot().table.pieces).toHaveLength(6);
});

test('the peak admits eighteen distinct carries, retains the one-carry-per-connection guard, and leaves the baseline cap intact', () => {
  const snapshot = loadSnapshot('stacked');
  const expanded = new Room(snapshot, 'stacked');
  const baselineCap = new Room(snapshot);
  for (let index = 0; index < 18; index++) {
    const input = {
      carryId: `carry-${index}`,
      sourcePieceId: snapshot.table.pieces[index]!.id,
      expectedVersion: 0,
      pickup: 'whole' as const,
    };
    expanded.begin(player(index), input);
    if (index < 16) {
      baselineCap.begin(player(index), input);
    } else {
      expect(() => baselineCap.begin(player(index), input)).toThrow('too many active carries');
    }
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
