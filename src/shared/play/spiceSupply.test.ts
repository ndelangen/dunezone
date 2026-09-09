import { describe, expect, test } from 'vitest';

import { spawnSpiceInState } from './commands';
import { freshTableState } from './model';
import { isSpicePiece, SPICE_LAYER_HEIGHT, SPICE_LAYER_PITCH } from './spice';
import { createSpiceStack, isSpiceSupplyPosition, spiceSupplySlot } from './spiceSupply';
import {
  CONTACT_SHADOW_EPSILON,
  contactShadowHeightAt,
  contactShadowScale,
  restingPositionAt,
  stackTopHeight,
  TABLE_SURFACE_Y,
  visibleLayerCount,
} from './tableGeometry';
import { isCollisionFreePosition } from './tablePhysics';
import { applyDraftToState, draftForGesture, heldPieceFor, settleCarryAtPosition } from './tableState';

describe('shared spice supply', () => {
  test('places separate batches beside the supply with distinct items and actor counts', () => {
    const first = spawnSpiceInState(freshTableState(), 10, 'Alice');
    const second = spawnSpiceInState(first, 2, 'Bob');
    const spice = second.pieces.filter(isSpicePiece);
    expect(spice.map((piece) => piece.items.length)).toEqual([10, 2]);
    expect(new Set(spice.flatMap((piece) => piece.items.map((item) => item.id))).size).toBe(12);
    expect(second.events.slice(0, 2).map((event) => event.message)).toEqual([
      'Bob spawned 2 spice.',
      'Alice spawned 10 spice.',
    ]);
    for (const piece of spice) {
      expect(isSpiceSupplyPosition(piece.position)).toBe(false);
      expect(
        isCollisionFreePosition(
          piece,
          piece.position,
          second.pieces.filter((other) => other !== piece)
        )
      ).toBe(true);
    }
  });

  test('rejects invalid batches without changing the table', () => {
    const state = freshTableState();
    const before = structuredClone(state);
    for (const count of [0, -1, 11, 1.5, NaN, Infinity]) {
      expect(() => spawnSpiceInState(state, count)).toThrow('between 1 and 10');
    }
    expect(state).toEqual(before);
  });

  test('uses compact layered token geometry without changing other markers', () => {
    const piece = createSpiceStack(2, 10);
    expect(visibleLayerCount(piece)).toBe(4);
    expect(stackTopHeight(piece)).toBeCloseTo(SPICE_LAYER_HEIGHT + 3 * SPICE_LAYER_PITCH);
    expect(contactShadowScale(piece, false)[0]).toBeCloseTo(0.39);
    expect(visibleLayerCount({ ...piece, stackKey: null })).toBe(1);
    expect(contactShadowScale('marker', false)[0]).toBe(1);
  });

  test('keeps a spice shadow below its token just beyond the board rim', () => {
    const piece = createSpiceStack(2, 1);
    const position = restingPositionAt([5, 0, 0], piece);
    const shadowY = contactShadowHeightAt(position, piece);

    expect(position[1]).toBe(TABLE_SURFACE_Y);
    expect(shadowY).toBeCloseTo(TABLE_SURFACE_Y + CONTACT_SHADOW_EPSILON);
    expect(shadowY).toBeLessThan(position[1] + stackTopHeight(piece));
  });

  test('the ordinary local drop flow deletes only the peeled spice at the supply', () => {
    const state = spawnSpiceInState(freshTableState(), 10, 'Alice');
    const source = state.pieces.find(isSpicePiece)!;
    const draft = draftForGesture(source, 'top')!;
    const position = spiceSupplySlot().position;
    const settled = settleCarryAtPosition(state, draft, position)!;
    expect(settled.position).toEqual(position);
    expect(heldPieceFor(state, settled)?.items.length).toBe(1);
    const returned = applyDraftToState(state, settled, 'Alice');
    expect(returned.pieces.find((piece) => piece.id === source.id)?.items.length).toBe(9);
    expect(returned.pieces.filter(isSpicePiece)).toHaveLength(1);
    expect(returned.events[0].message).toBe('Alice returned 1 spice to the supply.');
    expect(returned.pieces.filter((piece) => !isSpicePiece(piece))).toEqual(
      state.pieces.filter((piece) => !isSpicePiece(piece))
    );
    expect(returned.draftMove).toBeNull();
  });

  test('a locked source and an invalid withdrawal cannot be deleted', () => {
    const state = spawnSpiceInState(freshTableState(), 3);
    const source = state.pieces.find(isSpicePiece)!;
    const draft = { ...draftForGesture(source, 'top')!, position: spiceSupplySlot().position };
    const locked = { ...state, pieces: state.pieces.map((piece) => ({ ...piece, locked: true })) };
    const rejected = applyDraftToState(locked, draft);
    expect(rejected.events[0].status).toBe('rejected');
    expect(rejected.pieces).toEqual(locked.pieces);
    const duplicate = { ...draft, withdrawals: [...draft.withdrawals, ...draft.withdrawals] };
    const repeated = applyDraftToState(state, duplicate);
    expect(repeated.events[0].status).toBe('rejected');
    expect(repeated.pieces).toEqual(state.pieces);
  });
});
