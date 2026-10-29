import { expect, test } from 'vite-plus/test';

import { changes, segment } from '../../src/shared/jsonDiff';

test('names each changed value by its path, and leaves equal ones out', () => {
  const before = { phase: 3, table: { pieces: [{ id: 'a', position: [0, 0, 1] }] }, 'seat-1': true };
  const after = { phase: 4, table: { pieces: [{ id: 'a', position: [0, 0, 2] }, { id: 'b' }] }, 'seat-1': true };
  expect(changes(before, after)).toEqual([
    { path: '.phase', before: 3, after: 4 },
    { path: '.table.pieces[0].position[2]', before: 1, after: 2 },
    { path: '.table.pieces[1]', before: undefined, after: { id: 'b' } },
  ]);
});

test('reads added and removed keys as undefined on the other side', () => {
  expect(changes({ peek: { id: 'x' } }, { hand: [] })).toEqual([
    { path: '.peek', before: { id: 'x' }, after: undefined },
    { path: '.hand', before: undefined, after: [] },
  ]);
});

test('stops at the limit', () => {
  const before = Array.from({ length: 10 }, (_, index) => index);
  expect(
    changes(
      before,
      before.map((value) => value + 1),
      4
    )
  ).toHaveLength(4);
});

test('quotes keys that are not names', () => {
  expect(segment('seat-1')).toBe('["seat-1"]');
  expect(segment('hand')).toBe('.hand');
  expect(segment(2)).toBe('[2]');
});
