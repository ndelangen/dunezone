import { describe, expect, test } from 'vitest';

import { freshTableState, gestureBlockReason } from './model';

describe('table model', () => {
  test('starts with every physical object directly manipulable', () => {
    const state = freshTableState();

    expect(state.pieces.filter((piece) => piece.locked).map((piece) => piece.id)).toEqual([]);
  });

  test('keeps the storm outside the physical piece inventory', () => {
    const state = freshTableState();

    expect(state.pieces.some((piece) => piece.id === 'storm-marker')).toBe(false);
  });

  test('does not start pointer capture for a locked piece', () => {
    const state = freshTableState();
    const troop = state.pieces.find((piece) => piece.id === 'harkonnen-force-loose');

    expect(troop).toBeDefined();
    if (troop) {
      troop.locked = true;
    }
    expect(troop ? gestureBlockReason(troop) : null).toBe('Unlock Harkonnen troop first.');
  });

  test("starts pointer capture for another seat's piece", () => {
    const state = freshTableState();
    const atreides = state.pieces.find((piece) => piece.id === 'atreides-force-stack');

    expect(atreides).toBeDefined();
    expect(atreides ? gestureBlockReason(atreides) : 'missing').toBeNull();
  });
});
