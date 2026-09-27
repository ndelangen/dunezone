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
    const force = state.pieces.find((piece) => piece.id === 'harkonnen-force-loose');

    expect(force).toBeDefined();
    if (force) {
      force.locked = true;
    }
    expect(force ? gestureBlockReason(force) : null).toBe('Harkonnen force is locked.');
  });

  test("starts pointer capture for another seat's piece", () => {
    const state = freshTableState();
    const atreides = state.pieces.find((piece) => piece.id === 'atreides-force-stack');

    expect(atreides).toBeDefined();
    expect(atreides ? gestureBlockReason(atreides) : 'missing').toBeNull();
  });
});
