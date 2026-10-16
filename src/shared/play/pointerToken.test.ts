import { describe, expect, test } from 'vitest';

import { applyPieceAction } from './commands';
import { freshTableState } from './model';
import type { TablePiece, TableState, Vector3Tuple } from './model';
import { pieceFlipFrame, PIECE_FLIP_DURATION_MS } from './pieceFlip';
import { pointerRiders, piecesOnPlates, ridersOf } from './pointerRiders';
import { POINTER_BODY_RADIUS, POINTER_HEIGHT, POINTER_TOKEN_TYPE, pointerCovers } from './pointerToken';
import { SHARED_ITEM_PLACEMENT_ANCHORS } from './tableFurnitureLayout';
import { BOARD_SURFACE_Y, restingPositionAt, supportHeightAt } from './tableGeometry';
import { isCollisionFreePosition } from './tablePhysics';
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

    const draft = {
      ...draftForGesture(at(state, 'hms'), 'whole')!,
      position: [-1, 0.4, -1] as Vector3Tuple,
    };
    const shown = renderedPiecesFor({ ...state, draftMove: draft }).map((piece) =>
      piece.id === 'hms' ? { ...piece, position: draft.position } : piece
    );
    const carried = piecesOnPlates(shown, state.pieces).find((piece) => piece.id === 't')!;
    expect(carried.position).toEqual([-1, 0.4 + POINTER_HEIGHT, -1]);
  });
  test('leaves a locked piece where it stands', () => {
    const state = tableWith(plate([0, 0, 1]), {
      ...troop('t', [0, 0, 1]),
      locked: true,
    });
    const next = dropAt(state, 'hms', [-1, 0, -1])!;
    expect(at(next, 't').position).toEqual(at(state, 't').position);
  });

  test('its riders take the zone they are carried to', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]));
    const next = dropAt(state, 'hms', [-1, 0, -1])!;
    expect(at(next, 't').zoneId).toBe(at(next, 'hms').zoneId);
  });

  test('set down in a shelf slot, it takes its riders only where they fit', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0.2, 0, 1]));
    const next = dropAt(state, 'hms', SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position);
    const rider = at(next!, 't');
    expect(
      isCollisionFreePosition(
        rider,
        rider.position,
        next!.pieces.filter((piece) => piece.id !== 't')
      )
    ).toBe(true);
  });

  test('rests on the board when only its point reaches over it', () => {
    expect(
      supportHeightAt([0, 0, 4.7], {
        kind: 'force',
        orientation: 0,
        items: plate([0, 0, 0]).items,
      })
    ).toBe(BOARD_SURFACE_Y);
  });

  test('a page leaves a rider lifted off it in the hand that holds it', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]));
    const lifted = renderedPiecesFor(state).map((piece) =>
      piece.id === 't' ? { ...piece, position: [0, 0.38, piece.position[2]] as Vector3Tuple } : piece
    );
    expect(piecesOnPlates(lifted, state.pieces).find((piece) => piece.id === 't')!.position[1]).toBe(0.38);
  });

  test('holds a locked piece up on its top, without taking it along', () => {
    const state = tableWith(plate([0, 0, 1]), {
      ...troop('t', [0, 0, 1]),
      locked: true,
    });
    const shown = piecesOnPlates(renderedPiecesFor(state), state.pieces);
    expect(shown.find((piece) => piece.id === 't')!.position[1]).toBeCloseTo(
      at(state, 'hms').position[1] + POINTER_HEIGHT
    );

    const moved = renderedPiecesFor(state).map((piece) =>
      piece.id === 'hms' ? { ...piece, position: [-1, 0.4, -1] as Vector3Tuple } : piece
    );
    expect(piecesOnPlates(moved, state.pieces).find((piece) => piece.id === 't')!.position).toEqual(
      at(state, 't').position
    );
  });

  test('keeps a rider turned on its own on its top, turned as it is shown', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]));
    const turned = renderedPiecesFor(state).map((piece) => (piece.id === 't' ? { ...piece, orientation: 0.7 } : piece));
    const shown = piecesOnPlates(turned, state.pieces).find((piece) => piece.id === 't')!;
    expect(shown.position[1]).toBeCloseTo(at(state, 'hms').position[1] + POINTER_HEIGHT);
    expect(shown.orientation).toBeCloseTo(0.7);

    const both = turned.map((piece) => (piece.id === 'hms' ? { ...piece, orientation: 0.5 } : piece));
    expect(piecesOnPlates(both, state.pieces).find((piece) => piece.id === 't')!.orientation).toBeCloseTo(1.2);
  });

  test('keeps a rider on its top when a turn settles it a little lower on the board', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]));
    const turned = renderedPiecesFor(state).map((piece) =>
      piece.id === 't'
        ? {
            ...piece,
            orientation: 0.7,
            position: [0, 0.125, 1] as Vector3Tuple,
          }
        : piece
    );
    expect(piecesOnPlates(turned, state.pieces).find((piece) => piece.id === 't')!.position[1]).toBeCloseTo(
      at(state, 'hms').position[1] + POINTER_HEIGHT
    );
  });

  test("keeps a rider up on the board's rim where that stands higher than the plate's top", () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1.4]));
    const moved = plate([4.7, 0, 0], -Math.PI / 2);
    const shown = renderedPiecesFor(state).map((piece) => (piece.id === 'hms' ? { ...piece, ...moved } : piece));
    const rider = piecesOnPlates(shown, state.pieces).find((piece) => piece.id === 't')!;
    expect(rider.position[0]).toBeCloseTo(4.3);
    expect(rider.position[1]).toBeCloseTo(restingPositionAt([4.3, 0, 0], troopBase)[1]);
    expect(rider.position[1]).toBeGreaterThan(moved.position[1] + POINTER_HEIGHT);
  });

  test("lifts a rider turned on its own onto the board's rim where the turn needs it", () => {
    const cardBase = freshTableState().pieces.find((piece) => piece.kind === 'card')!;
    const card = {
      ...cardBase,
      id: 'c',
      orientation: 0,
      position: restingPositionAt([4.73, 0, 0], { ...cardBase, orientation: 0 }),
    };
    const state = tableWith(plate([4.7, 0, 0], -Math.PI / 2), card);
    const turned = renderedPiecesFor(state).map((piece) =>
      piece.id === 'c' ? { ...piece, orientation: Math.PI / 2 } : piece
    );
    const shown = piecesOnPlates(turned, state.pieces).find((piece) => piece.id === 'c')!;
    expect(shown.position[1]).toBeCloseTo(restingPositionAt([4.73, 0, 0], { ...card, orientation: Math.PI / 2 })[1]);
  });

  test('carries nobody while it is set in a battle', () => {
    const state = tableWith({ ...plate([0, 0, 1]), battleOverlay: 'battle' }, troop('t', [0, 0, 1]));
    expect(pointerRiders(state.pieces, at(state, 'hms'))).toEqual([]);
  });

  test('names its riders, so a page can move them as smoothly as the plate', () => {
    const state = tableWith(plate([0, 0, 1]), troop('t', [0, 0, 1]), troop('beside', [2, 0, 2]));
    expect([...ridersOf(state.pieces, new Set(['hms']))]).toEqual([['t', 'hms']]);
    expect(ridersOf(state.pieces, new Set(['beside'])).size).toBe(0);
  });

  test('lifts clear of the table as wide as its round end when it turns over', () => {
    const hms = plate([0, 0, 1]);
    const halfway = pieceFlipFrame(
      { fromRevision: 0, targetRevision: 1, startedAt: 0, heldSince: null },
      hms,
      PIECE_FLIP_DURATION_MS / 2
    );
    expect(halfway.lift).toBeGreaterThan(POINTER_BODY_RADIUS);
  });
});
