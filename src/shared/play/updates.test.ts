import { describe, expect, it } from 'vitest';

import { initialSnapshot, nextSnapshot } from './commands';
import { tableForViewer } from './protocol';
import type { RoomView } from './updates';
import { applyRoomUpdate, frameChange } from './updates';

const base = (): RoomView => ({
  type: 'view',
  epoch: 'epoch',
  sequence: 1,
  updates: 2,
  viewer: { userId: 'user', connectionId: 'connection', viewerSeat: 'harkonnen', displayName: 'One', color: '#000' },
  snapshot: initialSnapshot(),
  carries: [],
  pointers: [],
});
const encode = (before: RoomView, after: RoomView) => ({
  type: 'update' as const,
  epoch: after.epoch,
  baseSequence: 1,
  sequence: 2,
  ...frameChange(before, after),
});

describe('game transport reconstruction', () => {
  it('preserves reordered, added and removed pieces, versions and table metadata', () => {
    const before = base();
    const table = tableForViewer(before.snapshot, 'harkonnen');
    table.pieces = [...table.pieces.slice(1).reverse(), { ...table.pieces[0], id: 'new-piece' }];
    table.pieces[0] = { ...table.pieces[0], position: [1, 2, 3] };
    const after = { ...before, snapshot: nextSnapshot(before.snapshot, table, 3) };
    const result = applyRoomUpdate(before, encode(before, after));
    expect(result?.snapshot).toEqual(after.snapshot);
    expect(before.snapshot.revision).toBe(0);
  });

  it('sends identities once and then only changing pointer and carry fields', () => {
    const before = base();
    const { userId: _userId, ...identity } = before.viewer;
    before.pointers = [{ ...identity, position: [0, 0, 0], updatedAt: 1, sourceSeq: 0 }];
    before.carries = [
      {
        ...identity,
        id: 'carry',
        held: before.snapshot.table.pieces[0],
        withdrawnCounts: {},
        reservedIds: ['piece'],
        expiresAt: 1000,
        sourceSeq: 0,
      },
    ];
    const after = structuredClone(before);
    after.pointers[0].position = [2, 0, 0];
    after.pointers[0].sourceSeq = 1;
    after.carries[0].held.position = [2, 0, 0];
    after.carries[0].sourceSeq = 1;
    const update = encode(before, after);
    expect(update.activity.carries).toEqual([]);
    expect(update.activity.pointers).toEqual([]);
    expect(applyRoomUpdate(before, update)?.carries).toEqual(after.carries);
    expect(applyRoomUpdate(before, update)?.pointers).toEqual(after.pointers);
  });

  it('rejects gaps, another epoch and missing movement definitions without partial application', () => {
    const before = base();
    const update = encode(before, before);
    expect(applyRoomUpdate(before, { ...update, baseSequence: 0 })).toBeNull();
    expect(applyRoomUpdate(before, { ...update, epoch: 'another' })).toBeNull();
    expect(
      applyRoomUpdate(before, {
        ...update,
        activity: {
          ...update.activity,
          pointerMoves: [{ connectionId: 'missing', position: [1, 0, 0], updatedAt: 1 }],
        },
      })
    ).toBeNull();
    expect(before.pointers).toEqual([]);
  });
});
