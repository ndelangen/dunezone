import { describe, expect, test } from 'vitest';

import { applyPieceAction } from './commands';
import { HMS_HEIGHT, HMS_STACK_KEY, hmsCovers } from './hms';
import { hmsRiders, piecesOnPlates } from './hmsRiders';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { restingPositionAt } from './tableGeometry';
import { applyDraftToState, draftForGesture, renderedPiecesFor, settleCarryAtPosition } from './tableState';

const troopBase = freshTableState().pieces.find((piece) => piece.id === 'harkonnen-force-loose')!;

function plate(position: Vector3Tuple, orientation = 0): TablePiece {
  return {
    id: 'hms',
    label: 'HMS',
    owner: 'harkonnen',
    color: '#7d202d',
    accent: '#efac63',
    items: [{ id: 'hms-item', faceUp: true }],
    stackKey: HMS_STACK_KEY,
    position: restingPositionAt(position, { kind: 'marker', orientation }),
    orientation,
    zoneId: null,
    locked: false,
    kind: 'marker',
  };
}

function troop(id: string, position: Vector3Tuple): TablePiece {
  return {
    ...troopBase,
    id,
    items: [{ id: `${id}-item`, faceUp: true }],
    position: restingPositionAt(position, troopBase),
  };
}

function tableWith(...pieces: TablePiece[]): TableState {
  return { ...freshTableState(), pieces, selectedPieceId: null };
}

const at = (state: TableState, id: string) => state.pieces.find((piece) => piece.id === id)!;

function dropAt(state: TableState, id: string, position: Vector3Tuple) {
  const draft = draftForGesture(at(state, id), 'whole')!;
  const settled = settleCarryAtPosition(state, draft, position);
  return settled ? applyDraftToState(state, settled) : null;
}

describe('the HMS plate', () => {
  test('covers its round end and its point, and nothing beyond its edge', () => {
    const hms = plate([0, 0, 0]);
    expect(hmsCovers(hms, [0, 0, 0])).toBe(true);
    expect(hmsCovers(hms, [0, 0, -1.1])).toBe(true);
    expect(hmsCovers(hms, [0.5, 0, -1.1])).toBe(false);
    expect(hmsCovers(hms, [0, 0, 0.7])).toBe(false);
    /* Turned a quarter, its point faces the other way across the table. */
    expect(hmsCovers(plate([0, 0, 0], Math.PI / 2), [-1.1, 0, 0])).toBe(true);
  });

  test('a troop can be set down on it', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [2, 0, 1]));
    const next = dropAt(state, 't', [0.2, 0, 1])!;
    expect(at(next, 't').position[0]).toBeCloseTo(0.2);
    expect(hmsRiders(next.pieces, at(next, 'hms')).map((piece) => piece.id)).toEqual(['t']);
  });

  test('carries the troops on it, each keeping its place on the plate', () => {
    const state = tableWith(
      plate([0, 0, 1]),
      troop('front', [0, 0, 0.3]),
      troop('back', [0.25, 0, 1.2]),
      troop('beside', [1.4, 0, 1])
    );
    const next = dropAt(state, 'hms', [-1, 0, -1])!;
    expect(at(next, 'hms').position[0]).toBeCloseTo(-1);
    expect(at(next, 'front').position[0]).toBeCloseTo(-1);
    expect(at(next, 'front').position[2]).toBeCloseTo(-1.7);
    expect(at(next, 'back').position[0]).toBeCloseTo(-0.75);
    expect(at(next, 'back').position[2]).toBeCloseTo(-0.8);
    expect(at(next, 'beside').position).toEqual(at(state, 'beside').position);
  });

  test('a troop taken off stays behind when the plate moves on', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]));
    const off = dropAt(state, 't', [2, 0, 1])!;
    const next = dropAt(off, 'hms', [-1, 0, -1])!;
    expect(at(next, 't').position[0]).toBeCloseTo(2);
  });

  test('is never set down over a piece that does not ride it', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [-2, 0, -1]));
    const next = dropAt(state, 'hms', [-2, 0, -1])!;
    expect(hmsCovers(at(next, 'hms'), at(next, 't').position)).toBe(false);
    expect(hmsRiders(next.pieces, at(next, 'hms'))).toEqual([]);
  });

  test('turns the troops on it with it', () => {
    const state = tableWith(plate([0, 0, 0]), troop('t', [0, 0, -0.8]));
    const next = applyPieceAction(state, { kind: 'rotate', pieceId: 'hms', direction: 1, steps: 6 }, 0);
    const moved = at(next, 't');
    /* A quarter turn takes the point, and the troop at it, from -z round to +x. */
    expect(moved.position[0]).toBeCloseTo(0.8);
    expect(moved.position[2]).toBeCloseTo(0);
    expect(hmsCovers(at(next, 'hms'), moved.position)).toBe(true);
  });

  test('a page shows its riders on top, and carried along while the plate is in hand', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]), troop('beside', [1.4, 0, 1]));
    const resting = piecesOnPlates(renderedPiecesFor(state), state.pieces);
    expect(resting.find((piece) => piece.id === 't')!.position[1]).toBeCloseTo(
      at(state, 'hms').position[1] + HMS_HEIGHT
    );
    expect(resting.find((piece) => piece.id === 'beside')).toBe(at(state, 'beside'));

    const draft = { ...draftForGesture(at(state, 'hms'), 'whole')!, position: [-1, 0.4, -1] as Vector3Tuple };
    const shown = renderedPiecesFor({ ...state, draftMove: draft }).map((piece) =>
      piece.id === 'hms' ? { ...piece, position: draft.position } : piece
    );
    const carried = piecesOnPlates(shown, state.pieces).find((piece) => piece.id === 't')!;
    expect(carried.position).toEqual([-1, 0.4 + HMS_HEIGHT, -1]);
  });
});
