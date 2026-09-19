import { expect, test } from 'vitest';

import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import { sizeUpdate, updateLedger } from './redundancy.mjs';

const piece = (id, extra = {}) => ({
  id,
  kind: 'token',
  faction: 'atreides',
  count: 3,
  position: { x: 0.1, y: 0.2 },
  orientation: 0,
  locked: false,
  labels: ['troops', 'reserve'],
  ...extra,
});
const pointer = (connectionId, x) => ({
  connectionId,
  seat: 1,
  faction: 'atreides',
  position: { x, y: 0.5 },
  updatedAt: 10,
});
const view = () => ({
  type: 'view',
  epoch: 'e1',
  sequence: 4,
  viewer: { seat: 1 },
  snapshot: {
    revision: 7,
    phase: 2,
    controls: { storm: 3 },
    versions: { a: 1, b: 1, c: 1 },
    table: { pieces: [piece('a'), piece('b'), piece('c')], radius: 1 },
  },
  carries: [],
  pointers: [pointer('p1', 0.1), pointer('p2', 0.2)],
});
const update = (extra) => ({
  type: 'update',
  epoch: 'e1',
  baseSequence: 4,
  sequence: 5,
  activity: { carries: [], carryMoves: [], removedCarries: [], pointers: [], pointerMoves: [], removedPointers: [] },
  ...extra,
});
const sized = (message) => {
  const before = view();
  const after = applyRoomUpdate(before, message);
  expect(after).not.toBeNull();
  return sizeUpdate(before, after, message, Buffer.byteLength(JSON.stringify(message)));
};

test('a pointer move is activity and its minimal patch is the moved leaves', () => {
  const sizing = sized(
    update({
      activity: {
        carries: [],
        carryMoves: [],
        removedCarries: [],
        pointers: [],
        pointerMoves: [{ connectionId: 'p2', position: { x: 0.3, y: 0.5 }, updatedAt: 11 }],
        removedPointers: [],
      },
    })
  );
  expect(sizing.kind).toBe('activity');
  expect(sizing.snapshotBytes).toBe(0);
  expect(sizing.minimalActivityBytes).toBeGreaterThan(0);
  expect(sizing.minimalActivityBytes).toBeLessThan(sizing.activityBytes);
});

test('a whole piece sent for one moved field is durable and mostly repeated', () => {
  const sizing = sized(
    update({
      completedCommandId: 'cmd-1',
      snapshot: {
        baseRevision: 7,
        revision: 8,
        phase: 2,
        table: {},
        pieces: [piece('b', { position: { x: 0.4, y: 0.2 } })],
        removedPieces: [],
        versions: { b: 2 },
        removedVersions: [],
      },
    })
  );
  expect(sizing.kind).toBe('durable');
  expect(sizing.acknowledged).toBe(true);
  expect(sizing.minimalPieceBytes).toBeLessThan(sizing.pieceBytes / 2);
  expect(sizing.minimalSnapshotBytes).toBeLessThan(sizing.snapshotBytes);
});

test('a removed piece and a reordered table both count as changes', () => {
  const sizing = sized(
    update({
      snapshot: {
        baseRevision: 7,
        revision: 8,
        phase: 2,
        table: {},
        pieces: [],
        removedPieces: ['a'],
        pieceOrder: ['c', 'b'],
        versions: {},
        removedVersions: ['a'],
      },
    })
  );
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBeGreaterThan(0);
});

test('an update that changes nothing visible is empty even when it acknowledges a command', () => {
  const sizing = sized(
    update({
      completedCommandId: 'cmd-2',
      snapshot: {
        baseRevision: 7,
        revision: 8,
        phase: 2,
        table: {},
        pieces: [],
        removedPieces: [],
        versions: {},
        removedVersions: [],
      },
    })
  );
  expect(sizing.kind).toBe('empty');
  expect(sizing.acknowledged).toBe(true);
  expect(sizing.minimalSnapshotBytes).toBe(0);
  expect(sizing.minimalBytes).toBeGreaterThan(0);
});

test('activity bytes are derived from the frame and equal the activity change as sent', () => {
  const move = {
    carries: [],
    carryMoves: [],
    removedCarries: [],
    pointers: [],
    pointerMoves: [{ connectionId: 'p1', position: { x: 0.9, y: 0.5 }, updatedAt: 12 }],
    removedPointers: [],
  };
  const snapshot = {
    baseRevision: 7,
    revision: 8,
    phase: 2,
    table: {},
    pieces: [piece('a', { orientation: 90 })],
    removedPieces: [],
    versions: { a: 2 },
    removedVersions: [],
  };
  for (const message of [update({ activity: move }), update({ snapshot, activity: move, completedCommandId: 'c' })]) {
    const sizing = sized(message);
    expect(sizing.activityBytes).toBe(Buffer.byteLength(JSON.stringify(message.activity)));
    expect(sizing.snapshotBytes).toBe(message.snapshot ? Buffer.byteLength(JSON.stringify(message.snapshot)) : 0);
  }
});

test('a removed pointer and an appended pointer fall back to the keyed comparison', () => {
  const sizing = sized(
    update({
      activity: {
        carries: [],
        carryMoves: [],
        removedCarries: [],
        pointers: [pointer('p3', 0.7)],
        pointerMoves: [],
        removedPointers: ['p1'],
      },
    })
  );
  expect(sizing.kind).toBe('activity');
  expect(sizing.minimalActivityBytes).toBeGreaterThan(0);
});

test('the ledger sums per recipient class and states the repeated share', () => {
  const ledger = updateLedger();
  const durable = sized(
    update({
      snapshot: {
        baseRevision: 7,
        revision: 8,
        phase: 2,
        table: {},
        pieces: [piece('a', { orientation: 90 })],
        removedPieces: [],
        versions: { a: 2 },
        removedVersions: [],
      },
      activity: {
        carries: [],
        carryMoves: [],
        removedCarries: [],
        pointers: [],
        pointerMoves: [{ connectionId: 'p1', position: { x: 0.9, y: 0.5 }, updatedAt: 12 }],
        removedPointers: [],
      },
    })
  );
  const empty = sized(update({}));
  ledger.add('protocol-player', durable, {});
  ledger.add('protocol-player', durable, {});
  ledger.add('protocol-observer', durable, {});
  for (let index = 0; index < 5; index++) {
    ledger.add('protocol-observer', empty, { sequence: index });
  }
  const summary = ledger.summary(3, 12);
  expect(summary.unclassified).toBe(3);
  expect(summary.coordinatorMs).toBe(12);
  expect(summary.total.deliveries).toBe(8);
  expect(summary.emptyDeliveryShare).toBe(0.625);
  expect(summary.byRecipientClass['protocol-observer'].emptySamples).toEqual([
    { sequence: 0 },
    { sequence: 1 },
    { sequence: 2 },
  ]);
  expect(summary.byRecipientClass['protocol-player'].emptySamples).toEqual([]);
  expect(summary.byRecipientClass['protocol-player'].both.deliveries).toBe(2);
  expect(summary.byRecipientClass['protocol-observer'].both.bytes).toBe(durable.bytes);
  expect(summary.total.bytes).toBe(durable.bytes * 3 + empty.bytes * 5);
  expect(summary.repeatedShare.pieces).toBeGreaterThan(0.5);
  expect(summary.repeatedShare.activity).toBeGreaterThan(0);
  expect(summary.repeatedShare.all).toBeLessThan(1);
});
