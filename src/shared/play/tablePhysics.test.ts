import { describe, expect, test } from 'vitest';

import { freshTableState } from './model';
import type { TableState } from './model';
import { CARD_BAY_PLACEMENT_ANCHORS } from './tableFurnitureLayout';
import {
  clampPositionToTable,
  isCollisionFreePosition,
  piecesOverlapAt,
  piecesTouchForStack,
  TABLE_PLAY_RADIUS,
} from './tablePhysics';

function fixturePiece(state: TableState, id: string) {
  const piece = state.pieces.find((candidate) => candidate.id === id);
  if (!piece) {
    throw new Error(`Missing physics fixture ${id}`);
  }
  return piece;
}

function cardWellFixtures() {
  const state = freshTableState();
  const anchor = CARD_BAY_PLACEMENT_ANCHORS[0];
  if (!anchor) {
    throw new Error('Missing card-well fixture');
  }
  return {
    deck: fixturePiece(state, 'treachery-deck'),
    force: fixturePiece(state, 'harkonnen-force-loose'),
    anchor,
  };
}

function forceFixtures() {
  const state = freshTableState();
  const stack = fixturePiece(state, 'harkonnen-force-stack');
  const loose = fixturePiece(state, 'harkonnen-force-loose');
  stack.position = [0, 0.38, 0];
  loose.position = [0, 0.38, 0];
  return { stack, loose };
}

describe('half-scale force-token physics', () => {
  test('uses a 0.175-unit resting radius', () => {
    const { stack, loose } = forceFixtures();

    expect(piecesOverlapAt(stack, stack.position, loose, [0.349, 0.38, 0])).toBe(true);
    expect(piecesOverlapAt(stack, stack.position, loose, [0.35, 0.38, 0])).toBe(false);
  });

  test('releases a matching force stack just beyond the smaller snap range', () => {
    const { stack, loose } = forceFixtures();

    expect(piecesTouchForStack(loose, [0.36, 0.38, 0], stack)).toBe(true);
    expect(piecesTouchForStack(loose, [0.361, 0.38, 0], stack)).toBe(false);
  });

  test('allows a force-token center within 0.175 units of the table edge', () => {
    const { loose } = forceFixtures();
    const clamped = clampPositionToTable(loose, [10, 0.38, 0]);

    expect(clamped[0]).toBeCloseTo(TABLE_PLAY_RADIUS - 0.175, 8);
    expect(clamped[2]).toBe(0);
  });
});

describe('anchored card physics', () => {
  test('accepts a canonically aligned card in a card well', () => {
    const { deck, anchor } = cardWellFixtures();
    const alignedDeck = { ...deck, orientation: anchor.orientation };

    expect(clampPositionToTable(alignedDeck, anchor.position)).toEqual(anchor.position);
    expect(isCollisionFreePosition(alignedDeck, anchor.position, [])).toBe(true);
  });

  test('does not turn the furniture around a well into free placement space', () => {
    const { deck, force, anchor } = cardWellFixtures();

    const outsideWell = [anchor.position[0], anchor.position[1], anchor.position[2] + 0.8] as const;
    const clampedCard = clampPositionToTable({ ...deck, orientation: anchor.orientation }, [...outsideWell]);
    const clampedForce = clampPositionToTable(force, anchor.position);

    expect(clampedCard).not.toEqual(outsideWell);
    expect(Math.hypot(clampedCard[0], clampedCard[2])).toBeLessThan(Math.hypot(outsideWell[0], outsideWell[2]));
    expect(clampedForce).not.toEqual(anchor.position);
    expect(isCollisionFreePosition(force, anchor.position, [])).toBe(false);
  });
});
