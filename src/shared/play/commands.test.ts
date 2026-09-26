import { expect, test } from 'vitest';

import { applyPieceAction, initialSnapshot, nextSnapshot } from './commands';
import { freshTableState } from './model';
import { tableForViewer } from './protocol';

test('snapshots discard version entries when a split removes its source', () => {
  const previous = initialSnapshot();
  const table = applyPieceAction(
    tableForViewer(previous, 'harkonnen'),
    { kind: 'split', pieceId: 'harkonnen-force-stack', count: 5 },
    previous.phase
  );
  const next = nextSnapshot(previous, table);

  expect(next.table.pieces.some((piece) => piece.id === 'harkonnen-force-stack')).toBe(false);
  expect(next.versions).not.toHaveProperty('harkonnen-force-stack');
  expect(Object.keys(next.versions).sort()).toEqual(next.table.pieces.map((piece) => piece.id).sort());
  expect(previous.versions).toHaveProperty('harkonnen-force-stack', 0);
});

test('revision stamps advance legacy versions while preserving unchanged pieces', () => {
  const previous = { ...initialSnapshot(), revision: 37 };
  previous.versions['retired-piece'] = 12;
  const table = applyPieceAction(
    tableForViewer(previous, 'harkonnen'),
    { kind: 'lock', pieceId: 'harkonnen-force-stack' },
    previous.phase
  );
  const next = nextSnapshot(previous, table);

  expect(next.revision).toBe(38);
  expect(next.versions).toMatchObject({ 'harkonnen-force-stack': 38, 'atreides-force-stack': 0 });
  expect(next.versions).not.toHaveProperty('retired-piece');

  const reset = nextSnapshot(next, freshTableState(), 0, true);
  expect(reset.revision).toBe(39);
  expect(new Set(Object.values(reset.versions))).toEqual(new Set([39]));
});
