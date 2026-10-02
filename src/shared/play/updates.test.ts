import { describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { emptyBattlePlan, fixtureBattleFaces } from './battle';
import { initialSnapshot, nextSnapshot } from './commands';
import { emptyPublicControls } from './inventory';
import { serverMessageSchema, tableForViewer } from './protocol';
import type { RoomView } from './updates';
import { applyRoomUpdate, frameChange, frameChanges } from './updates';

const base = (): RoomView => ({
  type: 'view',
  epoch: 'epoch',
  sequence: 1,
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
const sent = (before: RoomView, after: RoomView) => {
  const message = serverMessageSchema.parse(JSON.parse(JSON.stringify(encode(before, after))));
  if (message.type !== 'update') {
    throw new Error('Expected an update.');
  }
  return message;
};

describe('game transport reconstruction', () => {
  it('delivers retained faction artwork at setup and preserves it through later piece updates', () => {
    const before = base();
    const after = structuredClone(before);
    const { background, logo, troops } = assetPublishingFaction;
    after.snapshot.factionArtwork = { captured: { background, logo, troops } };
    after.snapshot.stage = 'setup';
    after.snapshot.revision++;
    const message = serverMessageSchema.parse(encode(before, after));
    expect(message.type).toBe('update');
    if (message.type !== 'update') {
      throw new Error('Expected update');
    }
    expect(applyRoomUpdate(before, message)?.snapshot).toEqual(after.snapshot);
    const later = structuredClone(after);
    later.snapshot.revision++;
    later.snapshot.table.pieces[0].position = [1, 0, 1];
    expect(applyRoomUpdate(after, encode(after, later))?.snapshot.factionArtwork).toEqual(
      after.snapshot.factionArtwork
    );
  });
  it('omits unchanged cloned snapshots but preserves same-revision viewer changes', () => {
    const before = base();
    before.snapshot.controls = emptyPublicControls();
    before.snapshot.controls.seatRequests = [{ id: 'request', requesterName: 'Player', seat: null }];
    const cloned = {
      ...before,
      snapshot: { ...before.snapshot, controls: { ...before.snapshot.controls } },
    };
    expect(encode(before, cloned).snapshot).toBeUndefined();
    const own = {
      ...cloned,
      snapshot: {
        ...cloned.snapshot,
        controls: {
          ...cloned.snapshot.controls,
          seatRequests: [{ ...before.snapshot.controls.seatRequests[0], own: true }],
        },
      },
    };
    expect(applyRoomUpdate(before, encode(before, own))?.snapshot).toEqual(own.snapshot);
    const advanced = { ...cloned, snapshot: { ...cloned.snapshot, revision: 1 } };
    expect(applyRoomUpdate(before, encode(before, advanced))?.snapshot.revision).toBe(1);
  });

  it('drops a key the server removed', () => {
    const before = base();
    before.snapshot.controls = emptyPublicControls();
    const after = structuredClone(before);
    after.snapshot.revision++;
    delete after.snapshot.controls;
    expect(applyRoomUpdate(before, sent(before, after))?.snapshot).toEqual(after.snapshot);
  });

  it('keeps null for a battle that ended, as the fresh view carries it', () => {
    const before = base();
    before.snapshot.battlePlan = emptyBattlePlan(fixtureBattleFaces('harkonnen'));
    before.snapshot.battle = {
      id: 'battle',
      anchor: [0, 0, 0],
      territory: 'Marked territory',
      stage: 'preparing',
      deadline: null,
      sides: [{ factionId: 'harkonnen', ready: false, choice: null }, null],
    };
    const after = structuredClone(before);
    after.snapshot.revision++;
    after.snapshot.battle = null;
    after.snapshot.battlePlan = null;
    expect(applyRoomUpdate(before, sent(before, after))?.snapshot).toEqual(after.snapshot);
  });

  it('preserves reordered, added and removed pieces, versions and table metadata', () => {
    const before = base();
    const table = tableForViewer(before.snapshot, 'harkonnen');
    table.pieces = [...table.pieces.slice(1).reverse(), { ...table.pieces[0], id: 'new-piece' }];
    table.pieces[0] = { ...table.pieces[0], position: [1, 2, 3] };
    const after = { ...before, snapshot: nextSnapshot(before.snapshot, table, 3) };
    const result = applyRoomUpdate(before, encode(before, after));
    expect(result?.snapshot).toEqual(after.snapshot);
    expect(before.snapshot.revision).toBe(0);
    expect(result?.snapshot).not.toHaveProperty('factionArtwork');
  });

  it('patches saved movement while replacing changed definitions and preserving piece order', () => {
    const before = base();
    before.snapshot.table.pieces[1].inventory = 'shared';
    const after = structuredClone(before);
    after.snapshot.revision++;
    after.snapshot.table.pieces[0].position = [4, 0.2, 2];
    after.snapshot.table.pieces[0].orientation = 90;
    after.snapshot.table.pieces[0].zoneId = null;
    delete after.snapshot.table.pieces[1].inventory;
    after.snapshot.table.pieces[2].items[0].faceUp = false;
    const removed = after.snapshot.table.pieces.pop()!;
    after.snapshot.table.pieces.reverse();
    after.snapshot.table.pieces.push({ ...removed, id: 'added' });
    const update = serverMessageSchema.parse(encode(before, after));
    expect(update.type).toBe('update');
    if (update.type !== 'update') {
      throw new Error('Expected an update.');
    }
    expect(update.snapshot?.pieceMoves).toEqual([
      {
        id: before.snapshot.table.pieces[0].id,
        position: [4, 0.2, 2],
        orientation: 90,
        zoneId: null,
        flipRevision: 0,
      },
    ]);
    expect(update.snapshot?.pieces.map((piece) => piece.id)).toEqual(
      expect.arrayContaining([before.snapshot.table.pieces[1].id, before.snapshot.table.pieces[2].id, 'added'])
    );
    expect(applyRoomUpdate(before, update)?.snapshot).toEqual(after.snapshot);
  });

  it('requests a fresh view when a saved movement has no piece definition', () => {
    const before = base();
    const after = { ...before, snapshot: { ...before.snapshot, revision: 1 } };
    const update = encode(before, after);
    expect(
      applyRoomUpdate(before, {
        ...update,
        snapshot: {
          ...update.snapshot!,
          pieceMoves: [{ id: 'missing', position: [0, 0, 0], orientation: 0, zoneId: null, flipRevision: null }],
        },
      })
    ).toBeNull();
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

describe('activity identity', () => {
  it('keeps the carries list when only a pointer moved, and the pointers list when only a carry moved', () => {
    const viewer = base().viewer;
    const pointer = { ...viewer, position: [0, 0, 0] as [number, number, number], updatedAt: 1 };
    const piece = base().snapshot.table.pieces[0];
    const carry = {
      ...viewer,
      id: 'carry',
      held: piece,
      withdrawnCounts: {},
      reservedIds: [piece.id],
      expiresAt: 10,
    };
    const before = { ...base(), carries: [carry], pointers: [pointer] };
    const pointerMoved = applyRoomUpdate(
      before,
      sent(before, { ...before, pointers: [{ ...pointer, position: [1, 0, 0] }] })
    );
    expect(pointerMoved?.carries).toBe(before.carries);
    expect(pointerMoved?.pointers).not.toBe(before.pointers);
    const carryMoved = applyRoomUpdate(
      before,
      sent(before, { ...before, carries: [{ ...carry, held: { ...piece, position: [1, 0, 1] } }] })
    );
    expect(carryMoved?.pointers).toBe(before.pointers);
    expect(carryMoved?.carries[0]?.held.position).toEqual([1, 0, 1]);
  });
});

describe('shared frame changes', () => {
  it('match a fresh comparison and compare a pair of shared parts once', () => {
    const before = base();
    const after = structuredClone(before);
    after.snapshot.revision++;
    after.snapshot.table.pieces[0]!.position = [2, 0, 2];
    after.pointers = [
      {
        connectionId: 'c',
        viewerSeat: 'harkonnen',
        displayName: 'One',
        color: '#000',
        position: [1, 0, 1],
        updatedAt: 1,
        sourceSeq: 1,
      },
    ];
    const change = frameChanges();
    const first = change(before, after);
    expect(first).toEqual(frameChange(before, after));
    /* Another viewer whose frames share the same parts gets the same snapshot change without a second comparison. */
    const second = change({ ...before, epoch: 'other' }, { ...after, epoch: 'other' });
    expect(second.snapshot).toBe(first.snapshot);
    expect(second.activity).toEqual(first.activity);
  });
});
