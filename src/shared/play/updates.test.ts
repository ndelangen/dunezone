import { describe, expect, it } from 'vitest';

import { assetPublishingFaction } from '../factions/fixtures/assetPublishingFaction';
import { initialSnapshot, nextSnapshot } from './commands';
import { emptyPublicControls } from './inventory';
import { serverMessageSchema, tableForViewer } from './protocol';
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
  it('delivers retained faction artwork at setup and preserves it through later piece updates', () => {
    const before = base();
    const after = structuredClone(before);
    const { background, logo, troops } = assetPublishingFaction;
    after.snapshot.factionArtwork = { captured: { background, logo, troops } };
    after.snapshot.stage = 'setup';
    after.snapshot.revision++;
    const message = serverMessageSchema.parse(encode(before, after));
    expect(message.type).toBe('update');
    if (message.type !== 'update') throw new Error('Expected update');
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
    const update = serverMessageSchema.parse({ ...encode(before, after), ...frameChange(before, after, true) });
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
    expect(applyRoomUpdate(before, encode(before, after))?.snapshot).toEqual(after.snapshot);
    expect(encode(before, after).snapshot?.pieceMoves).toBeUndefined();
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
