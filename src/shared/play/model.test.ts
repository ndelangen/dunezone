import { describe, expect, test } from 'vite-plus/test';

import { freshTableState, gestureBlockReason } from './model';

describe('table model', () => {
  test('keeps the storm outside the physical piece inventory', () => {
    const state = freshTableState();

    expect(state.pieces.some((piece) => piece.id === 'storm-marker')).toBe(false);
  });

  test("starts pointer capture for another seat's piece", () => {
    const state = freshTableState();
    const atreides = state.pieces.find((piece) => piece.id === 'atreides-force-stack');

    expect(atreides).toBeDefined();
    expect(atreides ? gestureBlockReason(atreides) : 'missing').toBeNull();
  });
});
