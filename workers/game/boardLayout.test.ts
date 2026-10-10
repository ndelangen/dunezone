import { expect, test } from 'vitest';

import { emptySnapshot } from '../../src/shared/play/commands';
import { BOARD_RADIUS } from '../../src/shared/play/tableGeometry';
import { BOARD_LAYOUT, onCurrentBoard, storedSnapshotSchema } from './state';

const piece = (id: string, position: [number, number, number]) => ({ id, position });
const positions = (snapshot: unknown) =>
  (snapshot as { table: { pieces: { id: string; position: number[] }[] } }).table.pieces.map(({ id, position }) => [
    id,
    position,
  ]);

test('a game stored for the larger board moves everything on the round table in with it, and nothing beyond its edge', () => {
  const scale = BOARD_RADIUS / 4.25;
  const legacy = {
    table: {
      pieces: [
        piece('on-territory', [1, 0.13, -2]),
        piece('reserve', [5.35, 0.005, 0]),
        piece('deck-in-well', [5.72, 0.005, -1.32]),
        piece('on-shelf', [0, 0.005, 7.5]),
      ],
    },
    battleState: { anchor: [2, 0.13, 1] },
  };
  const moved = onCurrentBoard(legacy);
  expect(positions(moved)).toEqual([
    ['on-territory', [scale, 0.13, -2 * scale]],
    ['reserve', [5.35 * scale, 0.005, 0]],
    ['deck-in-well', [5.72, 0.005, -1.32]],
    ['on-shelf', [0, 0.005, 7.5]],
  ]);
  expect((moved as { battleState: { anchor: number[] } }).battleState.anchor).toEqual([2 * scale, 0.13, scale]);
  expect(onCurrentBoard(moved)).toBe(moved);
});

test('a snapshot read through the stored schema is stamped with the current board, so it never moves again', () => {
  const stored = storedSnapshotSchema.parse(emptySnapshot());
  expect(stored.boardLayout).toBe(BOARD_LAYOUT);
  const roundTrip = JSON.parse(JSON.stringify(stored)) as unknown;
  expect(onCurrentBoard(roundTrip)).toBe(roundTrip);
});
