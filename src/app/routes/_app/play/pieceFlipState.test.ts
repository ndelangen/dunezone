import { describe, expect, test } from 'vitest';

import { affordancesFor, freshTableState } from './model';
import type { EnforcementPolicy, TablePiece, TableState } from './model';
import { draftForGesture, flipPieceInState, renderedPiecesFor } from './TabletopContext';

function pieceFor(state: TableState, pieceId: string): TablePiece {
  const piece = state.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    throw new Error(`Missing piece ${pieceId}`);
  }
  return piece;
}

function itemIds(state: TableState): string[] {
  return state.pieces.flatMap((piece) => piece.items.map((item) => item.id)).sort();
}

const flippablePieceIds = ['treachery-card-loose', 'treachery-deck', 'harkonnen-force-loose', 'harkonnen-force-stack'];

describe('flipping cards and tokens', () => {
  test('starts every piece with no recorded flips', () => {
    expect(freshTableState().pieces.every((piece) => piece.flipRevision === 0)).toBe(true);
  });

  test.each(['treachery-card-loose', 'harkonnen-force-loose'])(
    'turns singleton %s over without moving it',
    (pieceId) => {
      const state = freshTableState();
      const original = pieceFor(state, pieceId);
      const next = flipPieceInState(state, pieceId);
      const flipped = pieceFor(next, pieceId);

      expect(flipped.items).toEqual([{ ...original.items[0], faceUp: false }]);
      expect(flipped).toEqual({
        ...original,
        items: flipped.items,
        flipRevision: 1,
      });
      expect(original.items[0]?.faceUp).toBe(true);
      expect(next.selectedPieceId).toBe(pieceId);
      expect(next.events[0]).toEqual({
        id: 'evt-002',
        command: 'piece.flip',
        message: `${original.label} flipped face down.`,
        status: 'accepted',
      });
      expect(next.nextEventNumber).toBe(3);
      expect(itemIds(next)).toEqual(itemIds(state));
      for (const piece of state.pieces) {
        if (piece.id !== pieceId) {
          expect(pieceFor(next, piece.id)).toBe(piece);
        }
      }
    }
  );

  test.each(['treachery-deck', 'harkonnen-force-stack'])(
    'flips every face and reverses physical bottom-to-top order for %s',
    (pieceId) => {
      const state = freshTableState();
      const original = pieceFor(state, pieceId);
      original.items = original.items.map((item, index) => ({
        ...item,
        faceUp: index % 2 === 1,
      }));
      const originalItems = original.items.map((item) => ({ ...item }));

      const next = flipPieceInState(state, pieceId);
      const flipped = pieceFor(next, pieceId);

      expect(flipped.items.map((item) => item.id)).toEqual(originalItems.map((item) => item.id).reverse());
      for (const item of flipped.items) {
        expect(item.faceUp).toBe(!originalItems.find((originalItem) => originalItem.id === item.id)?.faceUp);
      }
      expect(flipped.items.at(-1)?.id).toBe(originalItems[0]?.id);
      expect(original.items).toEqual(originalItems);
      expect(flipped.flipRevision).toBe(1);
      expect(itemIds(next)).toEqual(itemIds(state));
      expect(next.events[0]?.message).toBe(`${original.label} flipped face up.`);
    }
  );

  test.each(flippablePieceIds)(
    'two flips restore the order and faces of %s while keeping both revisions',
    (pieceId) => {
      const state = freshTableState();
      const original = pieceFor(state, pieceId);
      original.items = original.items.map((item, index) => ({ ...item, faceUp: index % 2 === 0 }));

      const once = flipPieceInState(state, pieceId);
      const twice = flipPieceInState(once, pieceId);

      expect(pieceFor(once, pieceId).flipRevision).toBe(1);
      expect(pieceFor(twice, pieceId)).toEqual({ ...original, flipRevision: 2 });
      expect(itemIds(twice)).toEqual(itemIds(state));
      expect(twice.events.filter((event) => event.command === 'piece.flip')).toHaveLength(2);
    }
  );

  test('treats an absent flip revision as zero', () => {
    const state = freshTableState();
    const pieceId = 'treachery-deck';
    delete pieceFor(state, pieceId).flipRevision;

    expect(pieceFor(flipPieceInState(state, pieceId), pieceId).flipRevision).toBe(1);
  });

  test('uses the selected piece when there is no explicit target', () => {
    const state = freshTableState();
    state.selectedPieceId = 'treachery-deck';

    expect(pieceFor(flipPieceInState(state), 'treachery-deck').flipRevision).toBe(1);
  });

  test('ignores a missing target or selection', () => {
    const state = freshTableState();
    state.selectedPieceId = null;

    expect(flipPieceInState(state)).toBe(state);
    expect(flipPieceInState(state, 'missing-piece')).toBe(state);
  });

  test.each(['card', 'force', 'marker'] as const)('ignores an empty %s piece', (kind) => {
    const state = freshTableState();
    const piece = pieceFor(state, 'treachery-deck');
    piece.kind = kind;
    piece.items = [];

    expect(flipPieceInState(state, piece.id)).toBe(state);
  });

  test('does not flip a marker', () => {
    const state = freshTableState();
    const piece = pieceFor(state, 'harkonnen-force-loose');
    piece.kind = 'marker';

    expect(flipPieceInState(state, piece.id)).toBe(state);
  });
});

describe('flip permissions and draft safety', () => {
  test.each(['strict', 'assisted', 'sandbox'] satisfies EnforcementPolicy[])(
    'keeps locked pieces unchanged under %s enforcement',
    (enforcement) => {
      const state = freshTableState();
      state.enforcement = enforcement;
      const piece = pieceFor(state, 'treachery-deck');
      piece.locked = true;

      const next = flipPieceInState(state, piece.id);

      expect(next.pieces).toBe(state.pieces);
      expect(next.selectedPieceId).toBe(state.selectedPieceId);
      expect(next.events[0]?.status).toBe('rejected');
      expect(next.events[0]?.message).toBe('Treachery deck is locked.');
      expect(pieceFor(next, piece.id).flipRevision).toBe(0);
    }
  );

  test.each([
    ['strict', 'rejected', 0],
    ['assisted', 'accepted-with-warning', 1],
    ['sandbox', 'accepted', 1],
  ] as const)('respects foreign ownership in %s mode', (enforcement, status, revision) => {
    const state = freshTableState();
    state.enforcement = enforcement;
    const piece = pieceFor(state, 'atreides-force-stack');

    const next = flipPieceInState(state, piece.id);

    expect(next.events[0]?.status).toBe(status);
    expect(pieceFor(next, piece.id).flipRevision).toBe(revision);
    expect(itemIds(next)).toEqual(itemIds(state));
    if (enforcement === 'strict') {
      expect(next.pieces).toBe(state.pieces);
      expect(next.events[0]?.message).toBe('Another seat controls Atreides forces.');
    }
  });

  test.each(['harkonnen-force-stack', 'treachery-deck'])(
    'allows owned or shared %s under strict enforcement',
    (pieceId) => {
      const state = freshTableState();
      state.enforcement = 'strict';

      const next = flipPieceInState(state, pieceId);

      expect(pieceFor(next, pieceId).flipRevision).toBe(1);
      expect(next.events[0]?.status).toBe('accepted');
    }
  );

  test.each(['top', 'whole'] as const)(
    'preserves a %s carry when flipping the source, held piece, or another piece',
    (pickup) => {
      const state = freshTableState();
      const source = pieceFor(state, 'treachery-deck');
      const draft = draftForGesture(source, pickup);
      if (!draft) {
        throw new Error('Could not begin a card gesture');
      }
      state.draftMove = draft;
      state.selectedPieceId = draft.pieceId;
      const originalRendered = renderedPiecesFor(state);

      for (const targetId of [source.id, draft.pieceId, 'harkonnen-force-stack']) {
        const next = flipPieceInState(state, targetId);

        expect(next.pieces).toBe(state.pieces);
        expect(next.draftMove).toBe(draft);
        expect(next.selectedPieceId).toBe(state.selectedPieceId);
        expect(renderedPiecesFor(next)).toEqual(originalRendered);
        expect(next.events[0]?.status).toBe('rejected');
        expect(next.events[0]?.message).toBe('Finish or cancel the current move before flipping.');
        expect(itemIds(next)).toEqual(itemIds(state));
      }
    }
  );
});

describe('flip affordances', () => {
  test.each([
    ['treachery-card-loose', 'Flip card'],
    ['treachery-deck', 'Flip deck'],
    ['harkonnen-force-loose', 'Flip token'],
    ['harkonnen-force-stack', 'Flip stack'],
  ])('names the action for %s', (pieceId, label) => {
    const state = freshTableState();
    state.selectedPieceId = pieceId;

    expect(affordancesFor(state).find((affordance) => affordance.commandType === 'piece.flip')?.label).toBe(label);
  });

  test.each(['locked', 'foreign', 'empty', 'marker', 'draft'] as const)(
    'does not offer flipping when the constraint is %s',
    (constraint) => {
      const state = freshTableState();
      state.selectedPieceId = 'treachery-deck';
      const piece = pieceFor(state, state.selectedPieceId);
      if (constraint === 'locked') {
        piece.locked = true;
      }
      if (constraint === 'foreign') {
        state.enforcement = 'strict';
        piece.owner = 'atreides';
      }
      if (constraint === 'empty') {
        piece.items = [];
      }
      if (constraint === 'marker') {
        piece.kind = 'marker';
      }
      if (constraint === 'draft') {
        state.draftMove = draftForGesture(piece, 'whole');
      }

      expect(affordancesFor(state).some((affordance) => affordance.commandType === 'piece.flip')).toBe(false);
    }
  );
});
