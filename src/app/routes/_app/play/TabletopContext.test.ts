import { describe, expect, test } from 'vitest';

import { freshTableState } from './model';
import type { DraftMove, TableState, Vector3Tuple } from './model';
import { CARD_BAY_PLACEMENT_ANCHORS, FURNITURE_SURFACE_Y } from './tableFurnitureLayout';
import { restingPositionAt } from './tableGeometry';
import {
  applyDraftToState,
  draftForGesture,
  draftWithAdditionalTop,
  heldPieceFor,
  moveStormInState,
  projectCarryAtPosition,
  renderedPiecesFor,
  settleCarryAtPosition,
} from './TabletopContext';

function itemIds(state: TableState): string[] {
  return state.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort();
}

function draft(overrides: Partial<DraftMove> = {}): DraftMove {
  return {
    operation: 'move',
    pieceId: 'treachery-deck-held-treachery-4',
    sourcePieceId: 'treachery-deck',
    pickedUpItemIds: ['treachery-4'],
    withdrawals: [{ sourcePieceId: 'treachery-deck', itemId: 'treachery-4' }],
    origin: [3.08, 0.22, -0.28],
    originOrientation: -0.08,
    position: [1.2, 0.22, -1.4],
    orientation: -0.08,
    targetZoneId: null,
    targetPieceId: null,
    warning: null,
    ...overrides,
  };
}

describe('storm commands', () => {
  test('advances one sector counter-clockwise and appends an event', () => {
    const state = freshTableState();
    const next = moveStormInState(state, 1);

    expect(next.stormSectorIndex).toBe(4);
    expect(next.events[0]).toEqual({
      id: 'evt-002',
      command: 'storm.move',
      message: 'Storm advanced to sector 5.',
      status: 'accepted',
    });
    expect(next.nextEventNumber).toBe(3);
  });

  test('moves back one sector with matching event copy', () => {
    const state = moveStormInState(freshTableState(), 1);
    const next = moveStormInState(state, -1);

    expect(next.stormSectorIndex).toBe(5);
    expect(next.events[0]?.message).toBe('Storm moved back to sector 6.');
  });

  test('preserves physical and in-progress tabletop state', () => {
    const state = freshTableState();
    const currentDraft = draft();
    state.draftMove = currentDraft;

    const next = moveStormInState(state);

    expect(next.pieces).toBe(state.pieces);
    expect(next.draftMove).toBe(currentDraft);
    expect(next.selectedPieceId).toBe(state.selectedPieceId);
  });

  test.each([0, 2, Number.NaN, Number.POSITIVE_INFINITY])('ignores an invalid runtime direction %s', (direction) => {
    const state = freshTableState();

    expect(moveStormInState(state, direction as -1 | 1)).toBe(state);
  });

  test('resets to sector 6', () => {
    expect(freshTableState().stormSectorIndex).toBe(5);
  });
});

describe('direct manipulation drafts', () => {
  test.each(['harkonnen-force-loose', 'bene-gesserit-force', 'treachery-card-loose'])(
    'moves singleton %s as one physical object',
    (pieceId) => {
      const state = freshTableState();
      const piece = state.pieces.find((candidate) => candidate.id === pieceId);

      expect(piece).toBeDefined();
      if (!piece) {
        return;
      }

      const move = draftForGesture(piece, 'top');

      expect(move?.pieceId).toBe(piece.id);
      expect(move?.sourcePieceId).toBe(piece.id);
      expect(move?.withdrawals).toEqual([]);

      if (!move) {
        return;
      }
      move.position = [-1.2, piece.position[1], -1.6];
      move.targetZoneId = null;
      const next = applyDraftToState(state, move);

      expect(next.pieces.find((candidate) => candidate.id === piece.id)?.position).toEqual(
        restingPositionAt(move.position, piece)
      );
      expect(next.draftMove).toBeNull();
      expect(next.events[0]?.command).toBe('piece.move');
    }
  );

  test('still peels the top item from a multi-item stack', () => {
    const state = freshTableState();
    const stack = state.pieces.find((piece) => piece.id === 'harkonnen-force-stack');

    expect(stack).toBeDefined();
    if (!stack) {
      return;
    }

    const move = draftForGesture(stack, 'top');

    expect(move?.pieceId).toBe('harkonnen-force-stack-held-h-force-5');
    expect(move?.withdrawals).toEqual([{ sourcePieceId: 'harkonnen-force-stack', itemId: 'h-force-5' }]);
  });

  test('drops a singleton onto a compatible stack in one step', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'harkonnen-force-loose');
    const stack = state.pieces.find((piece) => piece.id === 'harkonnen-force-stack');

    expect(loose).toBeDefined();
    expect(stack).toBeDefined();
    if (!loose || !stack) {
      return;
    }

    const move = draftForGesture(loose, 'top');
    expect(move).not.toBeNull();
    if (!move) {
      return;
    }
    move.operation = 'merge';
    move.position = [...stack.position];
    move.targetZoneId = stack.zoneId;
    move.targetPieceId = stack.id;

    const next = applyDraftToState(state, move);

    expect(next.pieces.filter((piece) => piece.owner === 'harkonnen')).toHaveLength(1);
    expect(next.pieces.find((piece) => piece.id === stack.id)?.items).toHaveLength(6);
    expect(next.draftMove).toBeNull();
    expect(next.events[0]?.command).toBe('stack.merge');
  });

  test('carries an additional item away without duplicating the singleton', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!loose || !deck) {
      throw new Error('Missing Treachery card fixtures');
    }
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }
    initial.operation = 'merge';
    initial.position = [deck.position[0], 0.52, deck.position[2]];
    initial.targetPieceId = deck.id;
    const heldPair = draftWithAdditionalTop(state, initial);
    expect(heldPair).not.toBeNull();
    if (!heldPair) {
      return;
    }
    heldPair.operation = 'move';
    heldPair.position = [0.8, 0.22, 0.8];
    heldPair.targetPieceId = null;
    heldPair.targetZoneId = null;

    const next = applyDraftToState(state, heldPair);
    const remainingDeck = next.pieces.find((piece) => piece.id === 'treachery-deck');
    const movedPair = next.pieces.find((piece) => piece.id === loose.id);

    expect(remainingDeck?.items.map((item) => item.id)).toEqual(['treachery-1', 'treachery-2', 'treachery-3']);
    expect(movedPair?.items.map((item) => item.id)).toEqual(['treachery-4', 'treachery-5']);
    expect(itemIds(next)).toEqual(itemIds(state));
    expect(next.draftMove).toBeNull();
  });

  test('does not take another item while carrying a whole stack', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    if (!deck || !loose) {
      throw new Error('Missing Treachery card fixtures');
    }
    const move = draftForGesture(deck, 'whole');
    if (!move) {
      throw new Error('Could not begin a whole-deck gesture');
    }
    move.operation = 'merge';
    move.position = [...loose.position];
    move.targetPieceId = loose.id;
    move.targetZoneId = loose.zoneId;

    expect(draftWithAdditionalTop(state, move)).toBeNull();
  });

  test('does not reinterpret a changed whole stack as a held singleton', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    if (!deck || !loose) {
      throw new Error('Missing Treachery card fixtures');
    }
    const move = draftForGesture(deck, 'whole');
    if (!move) {
      throw new Error('Could not begin a whole-deck gesture');
    }
    deck.items = deck.items.slice(-1);
    move.operation = 'merge';
    move.position = [...loose.position];
    move.targetPieceId = loose.id;
    move.targetZoneId = loose.zoneId;

    expect(draftWithAdditionalTop(state, move)).toBeNull();
  });

  test('rejects a held singleton whose contents change before release', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!loose || !deck) {
      throw new Error('Missing Treachery card fixtures');
    }
    const move = draftForGesture(loose, 'top');
    if (!move) {
      throw new Error('Could not begin a loose-card gesture');
    }
    const addedItem = deck.items.pop();
    if (!addedItem) {
      throw new Error('Missing a card to simulate a concurrent stack change');
    }
    loose.items.push(addedItem);
    move.position = [0.8, loose.position[1], 0.8];
    move.targetZoneId = null;

    const next = applyDraftToState(state, move);

    expect(next.events[0]?.status).toBe('rejected');
    expect(next.pieces.find((piece) => piece.id === loose.id)?.position).toEqual(loose.position);
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('rejects a held singleton that becomes locked before release', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!loose || !deck) {
      throw new Error('Missing Treachery card fixtures');
    }
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }
    initial.operation = 'merge';
    initial.position = [...deck.position];
    initial.targetPieceId = deck.id;
    initial.targetZoneId = deck.zoneId;
    const heldPair = draftWithAdditionalTop(state, initial);
    if (!heldPair) {
      throw new Error('Could not take a card from the deck');
    }
    loose.locked = true;

    const next = applyDraftToState(state, heldPair);

    expect(next.events[0]?.status).toBe('rejected');
    expect(next.events[0]?.message).toContain('locked');
    expect(next.pieces.find((piece) => piece.id === loose.id)?.locked).toBe(true);
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('does not take another item after the held singleton becomes locked', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!loose || !deck) {
      throw new Error('Missing Treachery card fixtures');
    }
    const move = draftForGesture(loose, 'top');
    if (!move) {
      throw new Error('Could not begin a loose-card gesture');
    }
    move.operation = 'merge';
    move.position = [...deck.position];
    move.targetPieceId = deck.id;
    move.targetZoneId = deck.zoneId;
    loose.locked = true;

    expect(draftWithAdditionalTop(state, move)).toBeNull();
  });

  test('does not take another item after a peeled source changes order', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    if (!deck || !loose) {
      throw new Error('Missing Treachery card fixtures');
    }
    const move = draftForGesture(deck, 'top');
    if (!move) {
      throw new Error('Could not peel a card from the deck');
    }
    move.operation = 'merge';
    move.position = [...loose.position];
    move.targetPieceId = loose.id;
    move.targetZoneId = loose.zoneId;
    deck.items = [deck.items[0], deck.items[1], deck.items[3], deck.items[2]].filter((item) => item !== undefined);

    expect(draftWithAdditionalTop(state, move)).toBeNull();
  });
});

describe('held tabletop groups', () => {
  test.each([
    {
      label: 'card packet',
      looseId: 'treachery-card-loose',
      stackId: 'treachery-deck',
    },
    {
      label: 'force packet',
      looseId: 'harkonnen-force-loose',
      stackId: 'harkonnen-force-stack',
    },
  ])('carries and settles a held $label without losing its items', ({ looseId, stackId }) => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === looseId);
    const stack = state.pieces.find((piece) => piece.id === stackId);
    if (!loose || !stack) {
      throw new Error(`Missing ${looseId} or ${stackId} fixture`);
    }
    const stackTop = stack.items.at(-1);
    if (!stackTop) {
      throw new Error(`${stackId} fixture is empty`);
    }
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error(`Could not begin a gesture for ${looseId}`);
    }
    const overStack: [number, number, number] = [stack.position[0], 0.72, stack.position[2]];
    const targeted = projectCarryAtPosition(state, initial, overStack);
    if (!targeted) {
      throw new Error(`Could not target ${stackId}`);
    }
    const pair = draftWithAdditionalTop(state, targeted);
    if (!pair) {
      throw new Error(`Could not take an additional item from ${stackId}`);
    }
    const pointerPosition: [number, number, number] = [stack.position[0] + 0.1, 0.72, stack.position[2] + 0.1];

    const projected = projectCarryAtPosition(state, pair, pointerPosition);
    const settledMerge = settleCarryAtPosition(state, pair, pointerPosition);

    expect(projected?.targetPieceId).toBe(stack.id);
    expect(projected?.position).toEqual(pointerPosition);
    expect(settledMerge?.operation).toBe('merge');
    expect(settledMerge?.targetPieceId).toBe(stack.id);
    if (!settledMerge) {
      return;
    }

    const merged = applyDraftToState(state, settledMerge);
    expect(merged.pieces.find((piece) => piece.id === stack.id)?.items.map((item) => item.id)).toEqual([
      ...stack.items.map((item) => item.id),
      ...loose.items.map((item) => item.id),
    ]);
    expect(itemIds(merged)).toEqual(itemIds(state));

    const awayPointer: Vector3Tuple = [0, 0.72, 0];
    const projectedAway = projectCarryAtPosition(state, pair, awayPointer);
    const settledAway = settleCarryAtPosition(state, pair, awayPointer);

    expect(projectedAway?.operation).toBe('move');
    expect(projectedAway?.targetPieceId).toBeNull();
    expect(projectedAway?.position).toEqual(awayPointer);
    expect(settledAway?.operation).toBe('move');
    expect(settledAway?.targetPieceId).toBeNull();
    if (!settledAway) {
      return;
    }

    const moved = applyDraftToState(state, settledAway);
    expect(moved.pieces.find((piece) => piece.id === stack.id)?.items.map((item) => item.id)).toEqual(
      stack.items.slice(0, -1).map((item) => item.id)
    );
    expect(moved.pieces.find((piece) => piece.id === pair.pieceId)?.items.map((item) => item.id)).toEqual([
      stackTop.id,
      ...loose.items.map((item) => item.id),
    ]);
    expect(new Set(itemIds(moved)).size).toBe(itemIds(moved).length);
    expect(itemIds(moved)).toEqual(itemIds(state));
  });

  test('uses an outward card pull as breakaway intent before settling at the rim', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!deck) {
      throw new Error('Missing Treachery deck fixture');
    }
    const first = draftForGesture(deck, 'top');
    if (!first) {
      throw new Error('Could not peel a card from the deck');
    }
    const overDeck: Vector3Tuple = [deck.position[0], 0.72, deck.position[2]];
    const targeted = projectCarryAtPosition(state, first, overDeck);
    const packet = targeted ? draftWithAdditionalTop(state, targeted) : null;
    if (!packet) {
      throw new Error('Could not take a second card from the deck');
    }
    const deckRadius = Math.hypot(deck.position[0], deck.position[2]);
    const rawPointer: Vector3Tuple = [(deck.position[0] / deckRadius) * 20, 0.22, (deck.position[2] / deckRadius) * 20];

    const projected = projectCarryAtPosition(state, packet, rawPointer);
    const settled = settleCarryAtPosition(state, packet, rawPointer);

    expect(projected?.operation).toBe('move');
    expect(projected?.targetPieceId).toBeNull();
    expect(projected?.position).toEqual(rawPointer);
    expect(settled?.operation).toBe('move');
    expect(settled?.targetPieceId).toBeNull();
    expect(settled?.position).not.toEqual(rawPointer);
    if (!settled) {
      return;
    }

    const next = applyDraftToState(state, settled);
    expect(next.pieces.find((piece) => piece.id === deck.id)?.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
    ]);
    expect(next.pieces.find((piece) => piece.id === packet.pieceId)?.items.map((item) => item.id)).toEqual([
      'treachery-3',
      'treachery-4',
    ]);
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('projects a quick peel without changing canonical stack contents', () => {
    const state = freshTableState();
    const move = draft();

    const rendered = renderedPiecesFor({ ...state, draftMove: move });
    const canonicalDeck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const renderedDeck = rendered.find((piece) => piece.id === 'treachery-deck');
    const heldCard = rendered.find((piece) => piece.id === move.pieceId);

    expect(canonicalDeck?.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
      'treachery-4',
    ]);
    expect(renderedDeck?.items.map((item) => item.id)).toEqual(['treachery-1', 'treachery-2', 'treachery-3']);
    expect(heldCard?.items.map((item) => item.id)).toEqual(['treachery-4']);
  });

  test('keeps the first held card on top when T takes more cards', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!loose || !deck) {
      throw new Error('Missing Treachery card fixtures');
    }
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }
    initial.operation = 'merge';
    initial.position = [deck.position[0], 0.52, deck.position[2]];
    initial.targetPieceId = deck.id;
    const afterFirstTake = draftWithAdditionalTop(state, initial);
    const move = afterFirstTake ? draftWithAdditionalTop(state, afterFirstTake) : null;

    expect(afterFirstTake).not.toBeNull();
    if (afterFirstTake) {
      const originalIndex = state.pieces.findIndex((piece) => piece.id === loose.id);
      const projectedIndex = renderedPiecesFor({ ...state, draftMove: afterFirstTake }).findIndex(
        (piece) => piece.id === loose.id
      );
      expect(projectedIndex).toBe(originalIndex);
    }

    expect(move).not.toBeNull();
    if (!move) {
      return;
    }

    expect(heldPieceFor(state, move)?.items.map((item) => item.id)).toEqual([
      'treachery-3',
      'treachery-4',
      'treachery-5',
    ]);

    const next = applyDraftToState(state, move);
    expect(next.pieces.find((piece) => piece.id === 'treachery-deck')?.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
      'treachery-4',
      'treachery-5',
    ]);
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('keeps an empty projected source as a gesture anchor', () => {
    const state = freshTableState();
    const move = draft({
      withdrawals: [
        { sourcePieceId: 'treachery-deck', itemId: 'treachery-4' },
        { sourcePieceId: 'treachery-deck', itemId: 'treachery-3' },
        { sourcePieceId: 'treachery-deck', itemId: 'treachery-2' },
        { sourcePieceId: 'treachery-deck', itemId: 'treachery-1' },
      ],
    });

    const rendered = renderedPiecesFor({ ...state, draftMove: move });

    expect(rendered.find((piece) => piece.id === 'treachery-deck')?.items).toEqual([]);
    expect(rendered.find((piece) => piece.id === move.pieceId)?.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
      'treachery-4',
    ]);
  });

  test.each([
    { label: 'card deck', stackId: 'treachery-deck' },
    { label: 'force stack', stackId: 'harkonnen-force-stack' },
  ])('can carry the entire $label after taking its last item', ({ stackId }) => {
    const state = freshTableState();
    const stack = state.pieces.find((piece) => piece.id === stackId);
    if (!stack) {
      throw new Error(`Missing ${stackId} fixture`);
    }
    const initial = draftForGesture(stack, 'top');
    if (!initial) {
      throw new Error(`Could not peel the top of ${stackId}`);
    }
    const overStack: Vector3Tuple = [stack.position[0], 0.72, stack.position[2]];
    let carried = projectCarryAtPosition(state, initial, overStack);
    if (!carried) {
      throw new Error(`Could not carry the top of ${stackId}`);
    }
    while (carried.targetPieceId) {
      const next = draftWithAdditionalTop(state, carried);
      if (!next) {
        break;
      }
      carried = next;
    }

    expect(carried.targetPieceId).toBeNull();
    expect(heldPieceFor(state, carried)?.items.map((item) => item.id)).toEqual(stack.items.map((item) => item.id));
    expect(renderedPiecesFor({ ...state, draftMove: carried }).find((piece) => piece.id === stack.id)?.items).toEqual(
      []
    );

    const awayPointer: Vector3Tuple = [0, 0.72, 0];
    const projectedAway = projectCarryAtPosition(state, carried, awayPointer);
    const settledAway = projectedAway ? settleCarryAtPosition(state, projectedAway, awayPointer) : null;

    expect(projectedAway?.position).toEqual(awayPointer);
    expect(settledAway?.operation).toBe('move');
    if (!settledAway) {
      return;
    }

    const moved = applyDraftToState(state, settledAway);
    expect(moved.pieces.some((piece) => piece.id === stack.id)).toBe(false);
    expect(moved.pieces.find((piece) => piece.id === carried.pieceId)?.items.map((item) => item.id)).toEqual(
      stack.items.map((item) => item.id)
    );
    expect(itemIds(moved)).toEqual(itemIds(state));
  });

  test('does not take from a stack that moved away from the held packet', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    if (!loose || !deck) {
      throw new Error('Missing Treachery card fixtures');
    }
    const move = draftForGesture(loose, 'top');
    if (!move) {
      throw new Error('Could not begin a loose-card gesture');
    }
    move.operation = 'merge';
    move.position = [3.08, 0.52, -0.28];
    move.targetPieceId = deck.id;
    deck.position = [-4, 0.22, -3];

    expect(draftWithAdditionalTop(state, move)).toBeNull();
  });

  test('moves a whole stack without changing its identity or item order', () => {
    const state = freshTableState();
    const move = draft({
      pieceId: 'treachery-deck',
      pickedUpItemIds: ['treachery-1', 'treachery-2', 'treachery-3', 'treachery-4'],
      withdrawals: [],
      position: [-1.2, 0.22, -1.6],
    });

    const next = applyDraftToState(state, move);
    const movedDeck = next.pieces.find((piece) => piece.id === 'treachery-deck');

    expect(movedDeck).toBeDefined();
    if (!movedDeck) {
      return;
    }

    expect(movedDeck.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
      'treachery-4',
    ]);
    expect(movedDeck.position).toEqual(restingPositionAt([-1.2, 0.22, -1.6], movedDeck));
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('rejects a held sequence when a requested item is no longer on top', () => {
    const state = freshTableState();
    const move = draft({
      withdrawals: [
        { sourcePieceId: 'treachery-deck', itemId: 'treachery-4' },
        { sourcePieceId: 'treachery-deck', itemId: 'treachery-2' },
      ],
    });

    const next = applyDraftToState(state, move);

    expect(next.events[0]?.status).toBe('rejected');
    expect(next.events[0]?.message).toContain('top');
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('checks the final move against every source in a combined group', () => {
    const state = freshTableState();
    const reserveStack = state.pieces.find((piece) => piece.id === 'harkonnen-force-stack');
    const loose = state.pieces.find((piece) => piece.id === 'harkonnen-force-loose');
    if (!reserveStack || !loose) {
      throw new Error('Missing Harkonnen fixture pieces');
    }
    loose.zoneId = 'arrakeen';
    loose.position = [0.2, 0.38, 0.2];
    state.enforcement = 'strict';
    const move = draft({
      pieceId: 'harkonnen-force-stack-held-h-force-5',
      sourcePieceId: reserveStack.id,
      pickedUpItemIds: ['h-force-5'],
      withdrawals: [
        { sourcePieceId: reserveStack.id, itemId: 'h-force-5' },
        { sourcePieceId: loose.id, itemId: 'h-force-6' },
      ],
      origin: [...reserveStack.position],
      position: [-2.55, 0.38, 1.75],
      orientation: 0,
      targetZoneId: 'harkonnen-reserve',
    });

    const next = applyDraftToState(state, move);

    expect(next.events[0]?.status).toBe('rejected');
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('rejects a merge when its live target moved after the preview', () => {
    const state = freshTableState();
    state.enforcement = 'strict';
    const move = draft({
      operation: 'merge',
      pieceId: 'harkonnen-force-stack-held-h-force-5',
      sourcePieceId: 'harkonnen-force-stack',
      pickedUpItemIds: ['h-force-5'],
      withdrawals: [{ sourcePieceId: 'harkonnen-force-stack', itemId: 'h-force-5' }],
      origin: [-2.72, 0.38, 1.85],
      position: [0.2, 0.58, 0.2],
      orientation: 0,
      targetZoneId: 'arrakeen',
      targetPieceId: 'harkonnen-force-loose',
    });

    const next = applyDraftToState(state, move);

    expect(next.events[0]?.status).toBe('rejected');
    expect(next.events[0]?.message).toContain('moved');
    expect(itemIds(next)).toEqual(itemIds(state));
  });
});

describe('card-well placement', () => {
  test.each([
    { pieceId: 'treachery-card-loose', pickup: 'top' as const },
    { pieceId: 'treachery-deck', pickup: 'whole' as const },
  ])('snaps $pieceId to a well without changing its cards', ({ pieceId, pickup }) => {
    const state = freshTableState();
    const piece = state.pieces.find((candidate) => candidate.id === pieceId);
    const anchor = CARD_BAY_PLACEMENT_ANCHORS[0];
    if (!piece || !anchor) {
      throw new Error('Missing card or card-well fixture');
    }
    const originalItems = piece.items.map((item) => ({ ...item }));
    const initial = draftForGesture(piece, pickup);
    if (!initial) {
      throw new Error(`Could not begin a gesture for ${pieceId}`);
    }
    const releasePosition: Vector3Tuple = [anchor.position[0] + 0.1, 0.38, anchor.position[2] - 0.1];

    const projected = projectCarryAtPosition(state, initial, releasePosition);
    const settled = settleCarryAtPosition(state, initial, releasePosition);

    expect(projected?.operation).toBe('move');
    expect(projected?.position).toEqual([anchor.position[0], releasePosition[1], anchor.position[2]]);
    expect(projected?.orientation).toBe(piece.orientation);
    expect(settled?.position).toEqual([anchor.position[0], FURNITURE_SURFACE_Y, anchor.position[2]]);
    expect(settled?.orientation).toBe(anchor.orientation);
    if (!settled) {
      return;
    }

    const next = applyDraftToState(state, settled);
    const placed = next.pieces.find((candidate) => candidate.id === pieceId);
    expect(placed?.position).toEqual(anchor.position);
    expect(placed?.orientation).toBe(anchor.orientation);
    expect(placed?.items).toEqual(originalItems);
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('preserves card rotation when a drag leaves a well', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const anchor = CARD_BAY_PLACEMENT_ANCHORS[0];
    if (!loose || !anchor) {
      throw new Error('Missing loose card or card-well fixture');
    }
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }
    const overWell = projectCarryAtPosition(state, initial, anchor.position);
    const backOnTable = overWell ? projectCarryAtPosition(state, overWell, [0, 0.38, 0]) : null;

    expect(overWell?.position[0]).toBe(anchor.position[0]);
    expect(overWell?.orientation).toBe(loose.orientation);
    expect(backOnTable?.position).toEqual([0, 0.38, 0]);
    expect(backOnTable?.orientation).toBe(loose.orientation);
  });

  test('snaps a multi-source held packet into a well atomically', () => {
    const state = freshTableState();
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const anchor = CARD_BAY_PLACEMENT_ANCHORS[5];
    if (!loose || !deck || !anchor) {
      throw new Error('Missing Treachery card or card-well fixtures');
    }
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }
    const overDeck = projectCarryAtPosition(state, initial, [deck.position[0], 0.38, deck.position[2]]);
    const packet = overDeck ? draftWithAdditionalTop(state, overDeck) : null;
    if (!packet) {
      throw new Error('Could not build a held card packet');
    }

    const settled = settleCarryAtPosition(state, packet, [anchor.position[0] - 0.08, 0.38, anchor.position[2] + 0.08]);
    if (!settled) {
      throw new Error('Could not settle the held packet in a card well');
    }
    const next = applyDraftToState(state, settled);

    expect(next.pieces.find((piece) => piece.id === loose.id)?.position).toEqual(anchor.position);
    expect(next.pieces.find((piece) => piece.id === loose.id)?.items.map((item) => item.id)).toEqual([
      'treachery-4',
      'treachery-5',
    ]);
    expect(next.pieces.find((piece) => piece.id === deck.id)?.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
    ]);
    expect(itemIds(next)).toEqual(itemIds(state));
  });

  test('keeps an adjacent empty well distinct from a nearby deck', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const occupiedAnchor = CARD_BAY_PLACEMENT_ANCHORS.find((anchor) => anchor.id === 'card-bay-right-2');
    const emptyAnchor = CARD_BAY_PLACEMENT_ANCHORS.find((anchor) => anchor.id === 'card-bay-right-3');
    if (!deck || !loose || !occupiedAnchor || !emptyAnchor) {
      throw new Error('Missing adjacent card-well fixtures');
    }
    deck.position = [...occupiedAnchor.position];
    deck.orientation = occupiedAnchor.orientation;
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }
    const releasePosition: Vector3Tuple = [emptyAnchor.position[0] - 0.45, 0.38, emptyAnchor.position[2]];

    const projected = projectCarryAtPosition(state, initial, releasePosition);
    const settled = settleCarryAtPosition(state, initial, releasePosition);

    expect(Math.hypot(releasePosition[0] - deck.position[0], releasePosition[2] - deck.position[2])).toBeLessThan(0.95);
    expect(projected?.operation).toBe('move');
    expect(projected?.targetPieceId).toBeNull();
    expect(settled?.position).toEqual(emptyAnchor.position);
  });

  test('merges onto a compatible deck already snapped into a well', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const anchor = CARD_BAY_PLACEMENT_ANCHORS[1];
    if (!deck || !loose || !anchor) {
      throw new Error('Missing Treachery card or card-well fixtures');
    }
    deck.position = [...anchor.position];
    deck.orientation = anchor.orientation;
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }

    const settled = settleCarryAtPosition(state, initial, [anchor.position[0] + 0.08, 0.38, anchor.position[2]]);

    expect(settled?.operation).toBe('merge');
    expect(settled?.targetPieceId).toBe(deck.id);
    if (!settled) {
      return;
    }
    const next = applyDraftToState(state, settled);
    expect(next.pieces.find((piece) => piece.id === deck.id)?.position).toEqual(anchor.position);
    expect(next.pieces.find((piece) => piece.id === deck.id)?.items.map((item) => item.id)).toEqual([
      'treachery-1',
      'treachery-2',
      'treachery-3',
      'treachery-4',
      'treachery-5',
    ]);
  });

  test('restores the source when a card well is occupied by a blocked stack', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const anchor = CARD_BAY_PLACEMENT_ANCHORS[2];
    if (!deck || !loose || !anchor) {
      throw new Error('Missing Treachery card or card-well fixtures');
    }
    deck.position = [...anchor.position];
    deck.orientation = anchor.orientation;
    deck.locked = true;
    const initial = draftForGesture(loose, 'top');
    if (!initial) {
      throw new Error('Could not begin a loose-card gesture');
    }

    const settled = settleCarryAtPosition(state, initial, anchor.position);

    expect(settled).toBeNull();
    expect(loose.position).not.toEqual(anchor.position);
    expect(itemIds(state)).toEqual(itemIds(freshTableState()));
  });

  test('revalidates an empty well when committing the drop', () => {
    const state = freshTableState();
    const deck = state.pieces.find((piece) => piece.id === 'treachery-deck');
    const loose = state.pieces.find((piece) => piece.id === 'treachery-card-loose');
    const anchor = CARD_BAY_PLACEMENT_ANCHORS[3];
    if (!deck || !loose || !anchor) {
      throw new Error('Missing Treachery card or card-well fixtures');
    }
    const initial = draftForGesture(loose, 'top');
    const settled = initial ? settleCarryAtPosition(state, initial, anchor.position) : null;
    if (!settled) {
      throw new Error('Could not prepare the card-well drop');
    }
    deck.position = [...anchor.position];
    deck.orientation = anchor.orientation;
    deck.stackKey = 'cards:blocked';

    const next = applyDraftToState(state, settled);

    expect(next.events[0]?.status).toBe('rejected');
    expect(next.pieces.find((piece) => piece.id === loose.id)?.position).toEqual(loose.position);
    expect(next.pieces.find((piece) => piece.id === deck.id)?.position).toEqual(anchor.position);
    expect(itemIds(next)).toEqual(itemIds(state));
  });
});
