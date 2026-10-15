import { describe, expect, test } from 'vitest';

import { applyPieceAction } from './commands';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { pointerRiders, piecesOnPlates } from './pointerRiders';
import { POINTER_HEIGHT, POINTER_TOKEN_TYPE, pointerCovers } from './pointerToken';
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
    items: [
      {
        id: 'hms-item',
        faceUp: true,
        artwork: {
          front: 'https://dune.zone/hms.jpg',
          back: 'https://dune.zone/hms.jpg',
          name: 'HMS',
          type: POINTER_TOKEN_TYPE,
        },
      },
    ],
    stackKey: 'token:hms',
    position: restingPositionAt(position, { kind: 'force', orientation }),
    orientation,
    zoneId: null,
    locked: false,
    kind: 'force',
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

describe('a pointer token, such as the HMS,', () => {
  test('covers its round end and its point, and nothing beyond its edge', () => {
    const hms = plate([0, 0, 0]);
    expect(pointerCovers(hms, [0, 0, 0])).toBe(true);
    expect(pointerCovers(hms, [0, 0, -0.75])).toBe(true);
    expect(pointerCovers(hms, [0.3, 0, -0.75])).toBe(false);
    expect(pointerCovers(hms, [0, 0, 0.5])).toBe(false);
    /* Turned a quarter, its point faces the other way across the table. */
    expect(pointerCovers(plate([0, 0, 0], Math.PI / 2), [-0.75, 0, 0])).toBe(true);
  });

  test('a troop can be set down on it', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [2, 0, 1]));
    const next = dropAt(state, 't', [0.2, 0, 1])!;
    expect(at(next, 't').position[0]).toBeCloseTo(0.2);
    expect(pointerRiders(next.pieces, at(next, 'hms')).map((piece) => piece.id)).toEqual(['t']);
  });

  test('carries the troops on it, each keeping its place on the plate', () => {
    const state = tableWith(
      plate([0, 0, 1]),
      troop('front', [0, 0, 0.4]),
      troop('back', [0.2, 0, 1.15]),
      troop('beside', [1.4, 0, 1])
    );
    const next = dropAt(state, 'hms', [-1, 0, -1])!;
    expect(at(next, 'hms').position[0]).toBeCloseTo(-1);
    expect(at(next, 'front').position[0]).toBeCloseTo(-1);
    expect(at(next, 'front').position[2]).toBeCloseTo(-1.6);
    expect(at(next, 'back').position[0]).toBeCloseTo(-0.8);
    expect(at(next, 'back').position[2]).toBeCloseTo(-0.85);
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
    expect(pointerCovers(at(next, 'hms'), at(next, 't').position)).toBe(false);
    expect(pointerRiders(next.pieces, at(next, 'hms'))).toEqual([]);
  });

  test('turns the troops on it with it', () => {
    const state = tableWith(plate([0, 0, 0]), troop('t', [0, 0, -0.6]));
    const next = applyPieceAction(state, { kind: 'rotate', pieceId: 'hms', direction: 1, steps: 6 }, 0);
    const moved = at(next, 't');
    /* A quarter turn takes the point, and the troop at it, from -z round to +x. */
    expect(moved.position[0]).toBeCloseTo(0.6);
    expect(moved.position[2]).toBeCloseTo(0);
    expect(pointerCovers(at(next, 'hms'), moved.position)).toBe(true);
  });

  test('a page shows its riders on top, and carried along while the plate is in hand', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]), troop('beside', [1.4, 0, 1]));
    const resting = piecesOnPlates(renderedPiecesFor(state), state.pieces);
    expect(resting.find((piece) => piece.id === 't')!.position[1]).toBeCloseTo(
      at(state, 'hms').position[1] + POINTER_HEIGHT
    );
    expect(resting.find((piece) => piece.id === 'beside')).toBe(at(state, 'beside'));

    const draft = { ...draftForGesture(at(state, 'hms'), 'whole')!, position: [-1, 0.4, -1] as Vector3Tuple };
    const shown = renderedPiecesFor({ ...state, draftMove: draft }).map((piece) =>
      piece.id === 'hms' ? { ...piece, position: draft.position } : piece
    );
    const carried = piecesOnPlates(shown, state.pieces).find((piece) => piece.id === 't')!;
    expect(carried.position).toEqual([-1, 0.4 + POINTER_HEIGHT, -1]);
  });
});
