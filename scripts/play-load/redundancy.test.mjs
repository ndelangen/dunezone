import { expect, test } from 'vitest';

import { tablePieceSchema } from '../../src/shared/play/schema.ts';
import { applyRoomUpdate } from '../../src/shared/play/updates.ts';
import { sizeUpdate, updateLedger } from './redundancy.mjs';

const size = (value) => Buffer.byteLength(JSON.stringify(value));
const item = (id, faceUp = false) => ({
  id,
  faceUp,
  artwork: {
    front: `https://cdn.example.invalid/${id}-front.png`,
    back: 'https://cdn.example.invalid/back.png',
    type: 'card',
  },
});
const piece = (id, extra = {}) =>
  tablePieceSchema.parse({
    id,
    label: `Piece ${id}`,
    owner: 'shared',
    color: '#123456',
    accent: '#abcdef',
    items: [item(`${id}-1`), item(`${id}-2`)],
    stackKey: null,
    position: [0.1, 0.2, 0],
    orientation: 0,
    zoneId: null,
    locked: false,
    kind: 'card',
    ...extra,
  });
const event = (id) => ({ id, command: 'move', message: `Moved ${id}`, status: 'accepted' });
const identity = (connectionId) => ({ connectionId, viewerSeat: 1, displayName: 'Paul', color: '#0f0' });
const pointer = (connectionId, x) => ({ ...identity(connectionId), position: [x, 0.5, 0], updatedAt: 10 });
const carry = (id, held) => ({
  ...identity(`${id}-conn`),
  id,
  held,
  withdrawnCounts: {},
  reservedIds: [],
  expiresAt: 1000,
  sourceSeq: 3,
});
const events = Array.from({ length: 8 }, (_, index) => event(`e${index + 1}`));
const view = () => ({
  type: 'view',
  epoch: 'e1',
  sequence: 4,
  viewer: { ...identity('viewer'), userId: 'u1' },
  snapshot: {
    revision: 7,
    phase: 2,
    versions: { a: 1, b: 1, c: 1 },
    table: {
      phase: 'Harkonnen shipment',
      stormSectorIndex: 3,
      pieces: [piece('a'), piece('b'), piece('c')],
      events,
      nextEventNumber: 9,
    },
  },
  carries: [carry('c1', piece('held'))],
  pointers: [pointer('p1', 0.1), pointer('p2', 0.2)],
});
const noActivity = () => ({
  carries: [],
  carryMoves: [],
  removedCarries: [],
  pointers: [],
  pointerMoves: [],
  removedPointers: [],
});
const noSnapshot = () => ({
  baseRevision: 7,
  revision: 8,
  phase: 2,
  table: {},
  pieces: [],
  removedPieces: [],
  versions: {},
  removedVersions: [],
});
const update = (extra) => ({
  type: 'update',
  epoch: 'e1',
  baseSequence: 4,
  sequence: 5,
  activity: noActivity(),
  ...extra,
  phaseCooldownMs: 0,
  battleCountdownMs: 0,
});
/** The envelope a patch message would carry: what the room sent without the two changes, plus the revisions. */
const envelope = (message) => {
  const { snapshot, activity: _activity, ...sent } = message;
  return { ...sent, ...(snapshot ? { baseRevision: snapshot.baseRevision, revision: snapshot.revision } : {}) };
};
const KEY = 12;
const sized = (message) => {
  const before = view();
  const after = applyRoomUpdate(before, message);
  expect(after).not.toBeNull();
  const sizing = sizeUpdate(before, after, message, size(message));
  expect(sizing.activityBytes).toBe(size(message.activity));
  expect(sizing.snapshotBytes).toBe(message.snapshot ? size(message.snapshot) : 0);
  expect(sizing.pieceBytes).toBe(
    message.snapshot
      ? size(message.snapshot.pieces) +
          (message.snapshot.removedPieces.length ? size(message.snapshot.removedPieces) : 0) +
          (message.snapshot.pieceOrder ? size(message.snapshot.pieceOrder) : 0)
      : 0
  );
  return sizing;
};

test('a pointer move is activity and its minimal patch holds the moved leaves only', () => {
  const message = update({
    activity: { ...noActivity(), pointerMoves: [{ connectionId: 'p2', position: [0.3, 0.5, 0], updatedAt: 11 }] },
  });
  const sizing = sized(message);
  expect(sizing.kind).toBe('activity');
  expect(sizing.acknowledged).toBe(false);
  expect(sizing.minimalSnapshotBytes).toBe(0);
  expect(sizing.minimalActivityBytes).toBe(size({ pointers: { p2: { position: [0.3, 0.5, 0], updatedAt: 11 } } }));
  expect(sizing.minimalBytes).toBe(size(envelope(message)) + KEY + sizing.minimalActivityBytes);
});

test('a moved piece and a new event are durable: one leaf per piece, the event by id, the rest of the table untouched', () => {
  const message = update({
    completedCommandId: 'cmd-1',
    snapshot: {
      ...noSnapshot(),
      table: { events: [event('e9'), ...events.slice(0, 7)], nextEventNumber: 10 },
      pieces: [piece('b', { position: [0.4, 0.2, 0] })],
      versions: { b: 2 },
    },
  });
  const sizing = sized(message);
  expect(sizing.kind).toBe('durable');
  expect(sizing.acknowledged).toBe(true);
  expect(sizing.minimalPieceBytes).toBe(size({ b: { position: [0.4, 0.2, 0] } }));
  expect(sizing.minimalSnapshotBytes).toBe(
    size({
      versions: { b: 2 },
      table: {
        pieces: { b: { position: [0.4, 0.2, 0] } },
        events: { e9: event('e9'), e8: null, order: ['e9', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'] },
        nextEventNumber: 10,
      },
    })
  );
  expect(sizing.minimalActivityBytes).toBe(0);
  expect(sizing.minimalBytes).toBe(size(envelope(message)) + KEY + sizing.minimalSnapshotBytes);
});

test('a flipped item inside a piece is addressed by its id', () => {
  const flipped = piece('b', { items: [item('b-1', true), item('b-2')] });
  const sizing = sized(update({ snapshot: { ...noSnapshot(), pieces: [flipped], versions: { b: 2 } } }));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ b: { items: { 'b-1': { faceUp: true } } } }));
});

test('a removed piece is a null entry and nothing else', () => {
  const sizing = sized(update({ snapshot: { ...noSnapshot(), removedPieces: ['a'], removedVersions: ['a'] } }));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ a: null }));
  expect(sizing.minimalSnapshotBytes).toBe(size({ versions: { a: null }, table: { pieces: { a: null } } }));
});

test('a reordered table is the order alone', () => {
  const sizing = sized(update({ snapshot: { ...noSnapshot(), pieceOrder: ['c', 'a', 'b'] } }));
  expect(sizing.kind).toBe('durable');
  expect(sizing.minimalPieceBytes).toBe(size({ order: ['c', 'a', 'b'] }));
});

test('an update that changes nothing visible is empty and its minimal size is the envelope as sent', () => {
  const message = update({ completedCommandId: 'cmd-2', snapshot: noSnapshot() });
  const sizing = sized(message);
  expect(sizing.kind).toBe('empty');
  expect(sizing.acknowledged).toBe(true);
  expect(sizing.minimalSnapshotBytes).toBe(0);
  expect(sizing.minimalActivityBytes).toBe(0);
  expect(sizing.minimalBytes).toBe(size(envelope(message)));
});

test('a carry pose is activity addressed by the carry id with the held piece patched inside it', () => {
  const message = update({
    activity: {
      ...noActivity(),
      carryMoves: [{ id: 'c1', position: [0.9, 0.2, 0], orientation: 90, expiresAt: 2000, sourceSeq: 4 }],
    },
  });
  const sizing = sized(message);
  expect(sizing.kind).toBe('activity');
  expect(sizing.minimalActivityBytes).toBe(
    size({ carries: { c1: { held: { position: [0.9, 0.2, 0], orientation: 90 }, expiresAt: 2000, sourceSeq: 4 } } })
  );
});

test('a pickup and a cancel are one whole carry and one null', () => {
  const picked = carry('c2', piece('taken'));
  const sizing = sized(update({ activity: { ...noActivity(), carries: [picked], removedCarries: ['c1'] } }));
  expect(sizing.kind).toBe('activity');
  expect(sizing.minimalActivityBytes).toBe(size({ carries: { c2: picked, c1: null } }));
});

test('a removed and an appended pointer leave the aligned path; an appended one alone is not empty', () => {
  const joined = pointer('p3', 0.7);
  const replaced = sized(update({ activity: { ...noActivity(), pointers: [joined], removedPointers: ['p1'] } }));
  expect(replaced.kind).toBe('activity');
  expect(replaced.minimalActivityBytes).toBe(size({ pointers: { p3: joined, p1: null } }));
  const appended = sized(update({ activity: { ...noActivity(), pointers: [joined] } }));
  expect(appended.kind).toBe('activity');
  expect(appended.minimalActivityBytes).toBe(size({ pointers: { p3: joined } }));
});

test('the ledger sums per recipient class, keeps empty samples and states the shares', () => {
  const ledger = updateLedger();
  const both = sized(
    update({
      snapshot: { ...noSnapshot(), pieces: [piece('a', { orientation: 90 })], versions: { a: 2 } },
      activity: { ...noActivity(), pointerMoves: [{ connectionId: 'p1', position: [0.9, 0.5, 0], updatedAt: 12 }] },
    })
  );
  const empty = sized(update({ completedCommandId: 'ack', snapshot: noSnapshot() }));
  ledger.add('protocol-player', both, {});
  ledger.add('protocol-player', both, {});
  ledger.add('protocol-observer', both, {});
  for (let index = 0; index < 5; index++) {
    ledger.add('protocol-observer', empty, { sequence: index });
  }
  const summary = ledger.summary(3, 12);
  const counters = (sizing, count) =>
    Object.fromEntries(
      Object.entries({ deliveries: 1, acknowledged: sizing.acknowledged ? 1 : 0, ...sizing })
        .filter(([name]) => name !== 'kind')
        .map(([name, value]) => [name, value * count])
    );
  const sum = (...parts) =>
    parts.reduce(
      (total, part) =>
        Object.fromEntries(Object.entries(part).map(([name, value]) => [name, value + (total[name] ?? 0)])),
      {}
    );
  expect(summary.unclassified).toBe(3);
  expect(summary.coordinatorMs).toBe(12);
  expect(summary.total).toEqual(sum(counters(both, 3), counters(empty, 5)));
  expect(summary.emptyDeliveryShare).toBe(0.625);
  expect(summary.byRecipientClass['protocol-player'].both).toEqual(counters(both, 2));
  expect(summary.byRecipientClass['protocol-observer'].empty).toEqual(counters(empty, 5));
  expect(summary.byRecipientClass['protocol-observer'].emptySamples).toEqual([
    { sequence: 0 },
    { sequence: 1 },
    { sequence: 2 },
  ]);
  expect(summary.byRecipientClass['protocol-player'].emptySamples).toEqual([]);
  const total = summary.total;
  const share = (sent, minimal) => Number((1 - minimal / sent).toFixed(3));
  expect(summary.repeatedShare).toEqual({
    all: share(total.bytes, total.minimalBytes),
    snapshot: share(total.snapshotBytes, total.minimalSnapshotBytes),
    pieces: share(total.pieceBytes, total.minimalPieceBytes),
    activity: share(total.activityBytes, total.minimalActivityBytes),
  });
  expect(summary.repeatedShare.pieces).toBeGreaterThan(0.9);
});
