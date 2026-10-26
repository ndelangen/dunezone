import { expect, test } from 'vite-plus/test';

import { initialSnapshot } from '../../src/shared/play/commands';
import type { TablePiece, Vector3Tuple } from '../../src/shared/play/model';
import { SHARED_ITEM_PLACEMENT_ANCHORS } from '../../src/shared/play/tableFurnitureLayout';
import { BOARD_RADIUS, restingPositionAt } from '../../src/shared/play/tableGeometry';
import { isOverlapFreePosition } from '../../src/shared/play/tablePhysics';
import { PLAYER_RING_RADIUS } from '../../src/shared/play/tableSettings';
import { moveOntoCurrentBoard, onCurrentBoard } from './boardLayoutSnapshot';
import type { StoredSnapshot } from './state';
import { BOARD_LAYOUT, storedSnapshotSchema } from './state';

const LEGACY_RING = 4.69;
const template = storedSnapshotSchema.parse(initialSnapshot()).table.pieces[0]!;
const piece = (id: string, position: Vector3Tuple) => ({ ...template, id, stackKey: id, position });

/* A game as the old board laid it out: no layout stamp, one faction's token and reserve at its seat. */
function legacyGame(revision: number, tokenX: number): StoredSnapshot {
  const snapshot = storedSnapshotSchema.parse({
    ...initialSnapshot(),
    revision,
    table: {
      ...initialSnapshot().table,
      pieces: [
        piece('on-territory', [1, 0.13, -2]),
        piece('token', [tokenX, 0.005, 0]),
        piece('reserve', [LEGACY_RING + 0.6592, 0.005, 0]),
        piece('at-rim', [0, 0.005, 4.7]),
        piece('deck-in-well', [5.72, 0.005, -1.32]),
        piece('on-shelf', [0, 0.005, 7.5]),
      ],
    },
  });
  const { boardLayout: _stamp, ...legacy } = snapshot;
  return legacy as StoredSnapshot;
}

const where = (snapshot: StoredSnapshot) =>
  Object.fromEntries(snapshot.table.pieces.map((entry) => [entry.id, entry.position]));

test('a game stored for the larger board moves its board in with the board, and its seats in with the seat ring', () => {
  const moved = where(moveOntoCurrentBoard(legacyGame(0, LEGACY_RING)));
  const scale = BOARD_RADIUS / 4.25;
  expect(moved['on-territory']![0]).toBeCloseTo(scale);
  expect(moved['on-territory']![2]).toBeCloseTo(-2 * scale);
  expect(moved.token![0]).toBeCloseTo(PLAYER_RING_RADIUS);
  /* The reserve keeps its distance behind the token, so the two never overlap. */
  expect(moved.reserve![0] - moved.token![0]).toBeCloseTo(0.6592);
  expect(moved['deck-in-well']).toEqual([5.72, 0.005, -1.32]);
  expect(moved['on-shelf']).toEqual([0, 0.005, 7.5]);
});

test('pieces set side by side on the old board still stand clear of each other on the smaller one', () => {
  const legacy = legacyGame(0, LEGACY_RING);
  const side = {
    ...legacy,
    table: { ...legacy.table, pieces: [piece('left', [1, 0.132, 0]), piece('right', [1.36, 0.132, 0])] },
  };
  const moved = moveOntoCurrentBoard(side).table.pieces as TablePiece[];
  expect(isOverlapFreePosition(moved[0]!, moved[0]!.position, [moved[1]!])).toBe(true);
});

test('a piece moved off the old board edge rests on what lies under its new place', () => {
  const moved = moveOntoCurrentBoard(legacyGame(0, LEGACY_RING)).table.pieces.find((entry) => entry.id === 'at-rim')!;
  expect(moved.position).toEqual(restingPositionAt(moved.position, moved));
});

test('occupied shared wells follow the deeper shelf while loose pieces and private inventory stay put', () => {
  const snapshot = storedSnapshotSchema.parse(initialSnapshot());
  const card = snapshot.table.pieces.find((entry) => entry.kind === 'card')!;
  const parked = SHARED_ITEM_PLACEMENT_ANCHORS.map((anchor, index) => ({
    ...card,
    id: `parked-${index}`,
    stackKey: `parked-${index}`,
    orientation: 0,
    position: [anchor.position[0], 0.005, anchor.position[2] - 1.2] as Vector3Tuple,
  }));
  const loose = { ...card, id: 'loose', position: [0, 0.005, 6.2] as Vector3Tuple };
  const privateCard = { ...parked[0]!, id: 'private', inventory: 'shared' as const };
  const stored = {
    ...snapshot,
    boardLayout: 3,
    table: { ...snapshot.table, pieces: [...parked, loose, privateCard] },
  };
  const moved = storedSnapshotSchema.parse(onCurrentBoard(stored));
  parked.forEach((entry, index) => {
    expect(moved.table.pieces[index]).toEqual({
      ...entry,
      position: restingPositionAt(SHARED_ITEM_PLACEMENT_ANCHORS[index]!.position, entry),
    });
  });
  expect(moved.table.pieces.slice(8)).toEqual([loose, privateCard]);
  expect(moved.factionInventories).toEqual(snapshot.factionInventories);
  expect(onCurrentBoard(moved)).toBe(moved);
});

test('a shared well item stays put when a player-arranged piece blocks its new destination', () => {
  const snapshot = storedSnapshotSchema.parse(initialSnapshot());
  const card = snapshot.table.pieces.find((entry) => entry.kind === 'card')!;
  const parked = { ...card, position: [-1.5, 0.005, 7.7] as Vector3Tuple, orientation: 0 };
  const blocker = piece('blocker', SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position);
  const pieces = [parked, blocker];
  const stored = { ...snapshot, boardLayout: 3, table: { ...snapshot.table, pieces } };
  expect(storedSnapshotSchema.parse(onCurrentBoard(stored)).table.pieces).toEqual(pieces);
});

test.each([0, 1, 8])('the former shared card takes a clear slot with %s slots occupied', (occupied) => {
  const snapshot = storedSnapshotSchema.parse(initialSnapshot());
  const card = snapshot.table.pieces.find((entry) => entry.kind === 'card')!;
  const parked = { ...card, position: [0, 0.005, 7.5] as Vector3Tuple, orientation: 0 };
  const blockers = SHARED_ITEM_PLACEMENT_ANCHORS.slice(0, occupied).map((anchor, index) =>
    piece(`blocker-${index}`, anchor.position)
  );
  const stored = { ...snapshot, boardLayout: 2, table: { ...snapshot.table, pieces: [...blockers, parked] } };
  const moved = storedSnapshotSchema.parse(onCurrentBoard(stored));
  expect(moved.table.pieces.slice(0, occupied)).toEqual(blockers);
  expect(moved.table.pieces.at(-1)).toEqual({
    ...parked,
    position:
      occupied === 8 ? parked.position : restingPositionAt(SHARED_ITEM_PLACEMENT_ANCHORS[occupied]!.position, parked),
  });
  expect(moved.factionInventories).toEqual(snapshot.factionInventories);
  expect(moved.revision).toBe(snapshot.revision);
  expect(onCurrentBoard(moved)).toEqual(moved);
});

test('cards arranged by players or held in inventory keep their positions when the shelf expands', () => {
  const snapshot = storedSnapshotSchema.parse(initialSnapshot());
  const card = snapshot.table.pieces.find((entry) => entry.kind === 'card')!;
  const pieces = [
    { ...card, id: 'turned', position: [0, 0.005, 7.5] as Vector3Tuple, orientation: Math.PI / 4 },
    { ...card, id: 'placed', position: [0.1, 0.005, 7.5] as Vector3Tuple, orientation: 0 },
    { ...card, id: 'stored', position: [0, 0.005, 7.5] as Vector3Tuple, orientation: 0, inventory: 'shared' as const },
  ];
  const stored = { ...snapshot, boardLayout: 2, table: { ...snapshot.table, pieces } };
  expect(storedSnapshotSchema.parse(onCurrentBoard(stored)).table.pieces).toEqual(pieces);
});

test('a snapshot read through the stored schema is stamped with the current board, so it never moves again', () => {
  const stored = storedSnapshotSchema.parse(initialSnapshot());
  expect(stored.boardLayout).toBe(BOARD_LAYOUT);
  const roundTrip = JSON.parse(JSON.stringify(stored)) as unknown;
  expect(onCurrentBoard(roundTrip)).toBe(roundTrip);
});
