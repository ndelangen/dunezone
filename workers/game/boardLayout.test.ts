import { DatabaseSync } from 'node:sqlite';

import { expect, test } from 'vitest';

import { initialSnapshot } from '../../src/shared/play/commands';
import type { Vector3Tuple } from '../../src/shared/play/model';
import { BOARD_RADIUS, restingPositionAt } from '../../src/shared/play/tableGeometry';
import { PLAYER_RING_RADIUS } from '../../src/shared/play/tableSettings';
import type { ActorDirectory } from './actors';
import { moveOntoCurrentBoard, moveStoredGameOntoCurrentBoard, onCurrentBoard } from './boardLayout';
import { diff } from './history';
import { SessionHistory } from './sessionHistory';
import type { SpiceLedger } from './spiceLedger';
import type { StoredSnapshot } from './state';
import { BOARD_LAYOUT, storedSnapshotSchema } from './state';

/* The part of Durable Object storage the move uses, over an in-memory SQLite database. */
function memoryStorage() {
  const database = new DatabaseSync(':memory:');
  return {
    sql: {
      exec: (query: string, ...bindings: (string | number | null)[]) => {
        const statement = database.prepare(query);
        const rows = statement.columns().length ? statement.all(...bindings) : (statement.run(...bindings), []);
        return { toArray: () => rows, one: () => rows[0], [Symbol.iterator]: () => rows[Symbol.iterator]() };
      },
    },
    transactionSync: <T>(run: () => T) => run(),
  } as unknown as DurableObjectStorage;
}

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
        piece('at-rim', [4.7, 0.005, 0.3]),
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

test('a piece moved off the old board edge rests on what lies under its new place', () => {
  const moved = moveOntoCurrentBoard(legacyGame(0, LEGACY_RING)).table.pieces.find((entry) => entry.id === 'at-rim')!;
  expect(moved.position).toEqual(restingPositionAt(moved.position, moved));
});

test('a stored game moves once, with its playback history, so every step plays back on the current board', () => {
  const storage = memoryStorage();
  const identity = { publicSnapshot: (snapshot: StoredSnapshot) => snapshot } as unknown as ActorDirectory;
  const ledger = { project: (snapshot: StoredSnapshot) => snapshot } as unknown as SpiceLedger;
  const history = new SessionHistory(storage, identity, ledger);
  const steps = [legacyGame(0, LEGACY_RING), legacyGame(1, LEGACY_RING - 0.2), legacyGame(2, LEGACY_RING - 0.4)];
  history.write({
    step: 0,
    base_revision: 0,
    revision: 0,
    phase: 0,
    kind: 'checkpoint',
    data: JSON.stringify(steps[0]),
    bytes: 0,
  });
  history.write({
    step: 1,
    base_revision: 0,
    revision: 1,
    phase: 0,
    kind: 'patch',
    data: JSON.stringify(diff(steps[0]!, steps[1]!)),
    bytes: 0,
  });
  history.write({
    step: 2,
    base_revision: 1,
    revision: 2,
    phase: 0,
    kind: 'patch',
    data: JSON.stringify(diff(steps[1]!, steps[2]!)),
    bytes: 0,
  });
  storage.sql.exec('CREATE TABLE current_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
  storage.sql.exec('INSERT INTO current_state VALUES (1, ?)', JSON.stringify(steps[2]));

  moveStoredGameOntoCurrentBoard(storage);
  steps.forEach((step, index) => {
    expect(where(history.restore(index))).toEqual(where(moveOntoCurrentBoard(step)));
  });
  const current = () => storage.sql.exec<{ data: string }>('SELECT data FROM current_state WHERE id=1').one().data;
  const stored = JSON.parse(current()) as StoredSnapshot;
  expect(stored.boardLayout).toBe(BOARD_LAYOUT);
  expect(where(stored)).toEqual(where(moveOntoCurrentBoard(steps[2]!)));

  const once = current();
  moveStoredGameOntoCurrentBoard(storage);
  expect(current()).toBe(once);
  expect(where(history.restore(2))).toEqual(where(moveOntoCurrentBoard(steps[2]!)));
});

test('a snapshot read through the stored schema is stamped with the current board, so it never moves again', () => {
  const stored = storedSnapshotSchema.parse(initialSnapshot());
  expect(stored.boardLayout).toBe(BOARD_LAYOUT);
  const roundTrip = JSON.parse(JSON.stringify(stored)) as unknown;
  expect(onCurrentBoard(roundTrip)).toBe(roundTrip);
});
