import { describe, expect, test } from 'vite-plus/test';

import { rotatedPiece } from './commands';
import { freshTableState } from './model';
import type { TableState, Vector3Tuple } from './model';
import { placementRules } from './pointerRiders';
import { POINTER_TOKEN_TYPE } from './pointerToken';
import { CARD_BAY_PLACEMENT_ANCHORS, SHARED_ITEM_PLACEMENT_ANCHORS } from './tableFurnitureLayout';
import {
  clampPositionToTable,
  isCollisionFreePosition,
  isOverlapFreePosition,
  LEADER_SPACING,
  piecesCanStack,
  piecesOverlapAt,
  piecesTouchForStack,
  restingAmongLeaders,
  TABLE_PLAY_RADIUS,
} from './tablePhysics';
import { draftForGesture, settleCarryAtPosition } from './tableState';
import { BOTTOM_SHELF_BOUNDS, isInTanks } from './tanksShelf';

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
    troop: fixturePiece(state, 'harkonnen-force-loose'),
    anchor,
  };
}

function troopFixtures() {
  const state = freshTableState();
  const stack = fixturePiece(state, 'harkonnen-force-stack');
  const loose = fixturePiece(state, 'harkonnen-force-loose');
  stack.position = [0, 0.38, 0];
  loose.position = [0, 0.38, 0];
  return { stack, loose };
}

describe('leader disc physics', () => {
  test('a leader rests on twice the radius of a troop token', () => {
    const { stack, loose } = troopFixtures();
    const leader = { ...loose, stackKey: 'leader:harkonnen:feyd' };

    expect(piecesOverlapAt(stack, stack.position, leader, [0.524, 0.38, 0])).toBe(true);
    expect(piecesOverlapAt(stack, stack.position, leader, [0.525, 0.38, 0])).toBe(false);
  });
});

describe('hidden leader stacking', () => {
  const disc = (id: string, faceUp: boolean) => {
    const { loose } = troopFixtures();
    return {
      ...loose,
      id,
      stackKey: 'token:cheap-hero',
      items: [
        {
          id: `${id}-item`,
          faceUp,
          artwork: { front: 'f.jpg', back: 'b.jpg', name: 'Cheap hero', type: 'token-disc' },
        },
      ],
    };
  };

  test('face-up copies of a catalogue disc stack by their key', () => {
    expect(piecesCanStack(disc('a', true), disc('b', true))).toBe(true);
  });

  test('a face-down disc that may fight as a leader stacks with nothing, so what it stacks with cannot name it', () => {
    expect(piecesCanStack(disc('a', false), disc('b', false))).toBe(false);
    expect(piecesCanStack(disc('a', false), disc('b', true))).toBe(false);
    expect(piecesCanStack(disc('a', true), disc('b', false))).toBe(false);
  });

  test('face-down troops still stack', () => {
    const { stack, loose } = troopFixtures();
    const down = (piece: typeof loose) => ({
      ...piece,
      items: piece.items.map((item) => ({ ...item, faceUp: false })),
    });
    expect(piecesCanStack(down(stack), down(loose))).toBe(true);
  });
});

describe('half-scale troop-token physics', () => {
  test('uses a 0.175-unit resting radius', () => {
    const { stack, loose } = troopFixtures();

    expect(piecesOverlapAt(stack, stack.position, loose, [0.349, 0.38, 0])).toBe(true);
    expect(piecesOverlapAt(stack, stack.position, loose, [0.35, 0.38, 0])).toBe(false);
  });

  test('releases a matching troop stack just beyond the smaller snap range', () => {
    const { stack, loose } = troopFixtures();

    expect(piecesTouchForStack(loose, [0.36, 0.38, 0], stack)).toBe(true);
    expect(piecesTouchForStack(loose, [0.361, 0.38, 0], stack)).toBe(false);
  });

  test('allows a troop-token center within 0.175 units of the table edge', () => {
    const { loose } = troopFixtures();
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
    const { deck, troop, anchor } = cardWellFixtures();

    const outsideWell = [anchor.position[0], anchor.position[1], anchor.position[2] + 0.8] as const;
    const clampedCard = clampPositionToTable({ ...deck, orientation: anchor.orientation }, [...outsideWell]);
    const clampedTroop = clampPositionToTable(troop, anchor.position);

    expect(clampedCard).not.toEqual(outsideWell);
    expect(Math.hypot(clampedCard[0], clampedCard[2])).toBeLessThan(Math.hypot(outsideWell[0], outsideWell[2]));
    expect(clampedTroop).not.toEqual(anchor.position);
    expect(isCollisionFreePosition(troop, anchor.position, [])).toBe(false);
  });
});

describe('leader discs in a pile', () => {
  const leaderAt = (id: string, position: Vector3Tuple) => ({
    ...cardWellFixtures().troop,
    id,
    stackKey: `leader:harkonnen:${id}`,
    position,
  });

  test('may overlap one another a little, but not much', () => {
    const resting = leaderAt('feyd', [0, 0.38, 7.5]);
    const moving = leaderAt('rabban', [0, 0.38, 7.5]);

    expect(isOverlapFreePosition(moving, [LEADER_SPACING + 0.01, 0.38, 7.5], [resting])).toBe(true);
    expect(isOverlapFreePosition(moving, [LEADER_SPACING - 0.01, 0.38, 7.5], [resting])).toBe(false);
  });

  test('overlap only in the Tanks: elsewhere they keep their whole footprint apart', () => {
    const resting = leaderAt('feyd', [0, 0.005, 0]);
    const moving = leaderAt('rabban', [0, 0.005, 0]);

    expect(isOverlapFreePosition(moving, [0.6, 0.005, 0], [resting])).toBe(false);
  });

  test('keep their whole footprint apart on an HMS plate in the Tanks', () => {
    const resting = leaderAt('feyd', [-0.3, 0.005, 7.5]);
    const moving = leaderAt('rabban', [0, 0.005, 0]);
    const hms = {
      ...cardWellFixtures().troop,
      id: 'hms',
      stackKey: 'token:hms',
      position: [0, 0.005, 7.5] as Vector3Tuple,
      items: [
        {
          id: 'hms-item',
          faceUp: true,
          artwork: { front: 'hms.jpg', back: 'hms.jpg', name: 'HMS', type: POINTER_TOKEN_TYPE },
        },
      ],
    };

    expect(isOverlapFreePosition(moving, [0.3, 0.005, 7.5], [resting])).toBe(true);
    expect(isOverlapFreePosition(moving, [0.3, 0.005, 7.5], [resting, hms])).toBe(false);
  });

  test('a leader carried on an HMS into the Tanks keeps its whole footprint from loose leaders', () => {
    const hms = {
      ...cardWellFixtures().troop,
      id: 'hms',
      stackKey: 'token:hms',
      position: [0, 0.005, 0] as Vector3Tuple,
      items: [
        {
          id: 'hms-item',
          faceUp: true,
          artwork: { front: 'hms.jpg', back: 'hms.jpg', name: 'HMS', type: POINTER_TOKEN_TYPE },
        },
      ],
    };
    const rider = leaderAt('feyd', [0.4, 0.055, 0]);
    const loose = leaderAt('rabban', [1, 0.005, 7.5]);
    const pieces = [hms, rider, loose];
    const rules = placementRules(pieces, hms, [rider, loose]);

    expect(rules.fits([0, 0.005, 7.5], 0)).toBe(false);
  });

  test('keeps its full footprint from other pieces', () => {
    const { troop } = cardWellFixtures();
    const moving = leaderAt('rabban', [0, 0.38, 7.5]);

    expect(isOverlapFreePosition(moving, [0.45, 0.38, 7.5], [{ ...troop, position: [0, 0.38, 7.5] }])).toBe(false);
  });

  test('rest just above the leaders they land across, so no two faces share a height', () => {
    const below = leaderAt('feyd', [0, 0.38, 7.5]);
    const onTop = leaderAt('piter', [0.6, 0.39, 7.5]);
    const moving = leaderAt('rabban', [0.3, 0.38, 7.5]);

    const rested = restingAmongLeaders(moving, [0.3, 0.38, 7.5], [below, onTop]);
    expect(rested[1]).toBeGreaterThan(0.39);
    expect(restingAmongLeaders(moving, [3, 0.38, 7.5], [below, onTop])).toEqual([3, 0.38, 7.5]);
  });

  test('may not overlap a leader in a shared well', () => {
    const well = SHARED_ITEM_PLACEMENT_ANCHORS[0]!.position;
    const resting = leaderAt('feyd', [well[0] + 0.5, 0.005, well[2] + 0.25]);
    const moving = leaderAt('rabban', [0, 0.005, 0]);
    const state = { ...freshTableState(), pieces: [resting, moving] };

    expect(settleCarryAtPosition(state, draftForGesture(moving, 'whole')!, [well[0], 0.4, well[2]])).toBeNull();
  });

  test('keep their place in the pile when turned', () => {
    const below = leaderAt('feyd', [0, 0.005, 7.5]);
    const onTop = leaderAt('piter', [0.6, 0.009, 7.5]);
    const state = { ...freshTableState(), pieces: [below, onTop] };

    expect(rotatedPiece(state, onTop, 1)?.position[1]).toBeCloseTo(0.009);
    expect(rotatedPiece(state, below, 1)?.position[1]).toBeCloseTo(0.005);
  });
});

describe('Tleilaxu Tanks shelf physics', () => {
  const inTanks = [0, 0.38, 6.2] as const;

  test('accepts troops, leaders and cards on the Tanks shelf', () => {
    const { deck, troop } = cardWellFixtures();
    const leader = { ...troop, stackKey: 'leader:harkonnen:feyd' };

    for (const piece of [troop, leader, deck]) {
      expect(isCollisionFreePosition(piece, [...inTanks], [])).toBe(true);
      expect(clampPositionToTable(piece, [...inTanks])).toEqual(inTanks);
    }
  });

  test('pulls a piece dropped past the shelf edge back onto the shelf, not onto the board', () => {
    const { troop } = cardWellFixtures();
    const clamped = clampPositionToTable(troop, [1, 0.38, BOTTOM_SHELF_BOUNDS.maxZ + 1]);

    expect(clamped[0]).toBeCloseTo(1, 8);
    expect(clamped[2]).toBeCloseTo(BOTTOM_SHELF_BOUNDS.maxZ - 0.175, 5);
    expect(isCollisionFreePosition(troop, clamped, [])).toBe(true);
  });

  test('accepts pieces that straddle the join between the board and the shelf', () => {
    const { deck, troop } = cardWellFixtures();
    const leader = { ...troop, stackKey: 'leader:harkonnen:feyd' };

    expect(clampPositionToTable(deck, [0, 0.38, 5])).toEqual([0, 0.38, 5]);
    expect(isCollisionFreePosition(deck, [0, 0.38, 5], [])).toBe(true);
    expect(clampPositionToTable(leader, [2, 0.38, 4.9])).toEqual([2, 0.38, 4.9]);
    expect(isCollisionFreePosition(leader, [2, 0.38, 4.9], [])).toBe(true);
  });

  test('still refuses a piece hanging off the shelf where it narrows to the shared item slots', () => {
    const { troop } = cardWellFixtures();

    expect(isCollisionFreePosition(troop, [2.45, 0.38, 10], [])).toBe(false);
  });

  test('takes pieces anywhere on the Tanks pad, out to its far corners', () => {
    const { troop } = cardWellFixtures();
    const leader = { ...troop, stackKey: 'leader:harkonnen:feyd' };
    const farCorner = [Math.cos(1.13) * 8.9, 0.38, Math.sin(1.13) * 8.9] as const;

    expect(isInTanks(farCorner)).toBe(true);
    expect(isCollisionFreePosition(leader, [...farCorner], [])).toBe(true);
  });

  test('pulls a piece dropped beside the pad back onto the shelf', () => {
    const { troop } = cardWellFixtures();
    const clamped = clampPositionToTable(troop, [6.5, 0.38, 8]);

    expect(isCollisionFreePosition(troop, clamped, [])).toBe(true);
    expect(Math.hypot(clamped[0] - 6.5, clamped[2] - 8)).toBeLessThan(2);
  });

  test('keeps the side card bays closed to troops', () => {
    const { troop } = cardWellFixtures();

    expect(isCollisionFreePosition(troop, [6.22, 0.38, 0], [])).toBe(false);
  });
});
