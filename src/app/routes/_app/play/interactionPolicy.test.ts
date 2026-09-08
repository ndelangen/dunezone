import { describe, expect, test } from 'vitest';

import { interactionSurfacePolicy } from './interactionPolicy';
import { freshTableState, gestureBlockReason } from './model';

describe('tabletop interaction policy', () => {
  test('starts with every physical object directly manipulable', () => {
    const state = freshTableState();

    expect(state.enforcement).toBe('sandbox');
    expect(state.pieces.filter((piece) => piece.locked).map((piece) => piece.id)).toEqual([]);
  });

  test('keeps diagnostics off the normal play surface', () => {
    expect(interactionSurfacePolicy(false, null)).toEqual({
      debugPanelsVisible: false,
      overlaysInert: false,
    });
  });

  test('makes every overlay inert while a board gesture is active', () => {
    expect(interactionSurfacePolicy(true, 'treachery-deck')).toEqual({
      debugPanelsVisible: true,
      overlaysInert: true,
    });
  });

  test('makes every overlay inert as soon as a tabletop pointer session starts', () => {
    expect(interactionSurfacePolicy(false, null, true)).toEqual({
      debugPanelsVisible: false,
      overlaysInert: true,
    });
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
    expect(force ? gestureBlockReason(state, force) : null).toBe('Harkonnen force is locked.');
  });

  test('does not start pointer capture for another seat in Strict mode', () => {
    const state = freshTableState();
    state.enforcement = 'strict';
    const atreides = state.pieces.find((piece) => piece.id === 'atreides-force-stack');

    expect(atreides).toBeDefined();
    expect(atreides ? gestureBlockReason(state, atreides) : null).toBe('Another seat controls Atreides forces.');
  });

  test('allows the same foreign piece in Assisted mode', () => {
    const state = freshTableState();
    const atreides = state.pieces.find((piece) => piece.id === 'atreides-force-stack');

    expect(atreides).toBeDefined();
    expect(atreides ? gestureBlockReason(state, atreides) : 'missing').toBeNull();
  });
});
