import { describe, expect, test } from 'vitest';

import { freshTableState } from './model';
import type { TablePiece } from './model';
import { draftForGesture, finishPieceFlipInView, requestPieceFlip } from './TabletopContext';
import type { TabletopViewState } from './TabletopContext';

function freshView(): TabletopViewState {
  return { table: freshTableState(), flippingPieceIds: new Map() };
}

function pieceFor(view: TabletopViewState, pieceId: string): TablePiece {
  const piece = view.table.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece) {
    throw new Error(`Missing piece ${pieceId}`);
  }
  return piece;
}

const flippablePieceIds = [
  'treachery-card-loose',
  'treachery-deck',
  'harkonnen-force-loose',
  'harkonnen-force-stack',
  'atreides-force-stack',
  'bene-gesserit-force',
];

describe('per-object flip activity', () => {
  test.each(flippablePieceIds)('blocks repeated requests while %s is animating', (pieceId) => {
    const initial = freshView();
    const original = pieceFor(initial, pieceId);
    const started = requestPieceFlip(initial, pieceId);
    const flipped = pieceFor(started, pieceId);

    expect(started.flippingPieceIds.get(pieceId)).toBe(1);
    expect(started.flippingPieceIds.size).toBe(1);
    expect(flipped.flipRevision).toBe(1);
    expect(flipped.items).toEqual([...original.items].reverse().map((item) => ({ ...item, faceUp: !item.faceUp })));
    expect(started.table.nextEventNumber).toBe(initial.table.nextEventNumber + 1);
    expect(initial.flippingPieceIds.size).toBe(0);
    expect(pieceFor(initial, pieceId)).toBe(original);

    let repeated = started;
    for (let request = 0; request < 20; request += 1) {
      repeated = requestPieceFlip(repeated, pieceId);
      expect(repeated).toBe(started);
    }
    expect(repeated.table.events).toBe(started.table.events);
    expect(repeated.table.nextEventNumber).toBe(started.table.nextEventNumber);
    expect(pieceFor(repeated, pieceId)).toBe(flipped);
    expect(pieceFor(repeated, pieceId).flipRevision).toBe(1);
  });

  test('applies the same gate to the selected object', () => {
    const initial = freshView();
    initial.table.selectedPieceId = 'treachery-deck';
    const started = requestPieceFlip(initial);

    expect(started.flippingPieceIds.get('treachery-deck')).toBe(1);
    expect(requestPieceFlip(started)).toBe(started);
    expect(requestPieceFlip(started, 'treachery-deck')).toBe(started);
  });

  test('lets other objects flip while keeping existing activity locks', () => {
    const first = requestPieceFlip(freshView(), 'treachery-deck');
    const second = requestPieceFlip(first, 'harkonnen-force-loose');

    expect([...second.flippingPieceIds]).toEqual([
      ['treachery-deck', 1],
      ['harkonnen-force-loose', 1],
    ]);
    expect([...first.flippingPieceIds]).toEqual([['treachery-deck', 1]]);
    expect(pieceFor(second, 'treachery-deck')).toBe(pieceFor(first, 'treachery-deck'));
    expect(pieceFor(second, 'harkonnen-force-loose').flipRevision).toBe(1);
    expect(second.table.nextEventNumber).toBe(first.table.nextEventNumber + 1);
    expect(requestPieceFlip(second, 'treachery-deck')).toBe(second);
  });

  test.each(flippablePieceIds)('only unlocks %s when its active revision finishes', (pieceId) => {
    const initial = freshView();
    const started = requestPieceFlip(initial, pieceId);

    for (const staleRevision of [-1, 0, 2, 100]) {
      expect(finishPieceFlipInView(started, pieceId, staleRevision)).toBe(started);
    }
    expect(finishPieceFlipInView(started, 'missing-piece', 1)).toBe(started);

    const finished = finishPieceFlipInView(started, pieceId, 1);
    expect(finished.flippingPieceIds.has(pieceId)).toBe(false);
    expect(started.flippingPieceIds.get(pieceId)).toBe(1);
    expect(finished.table).toBe(started.table);
    expect(finishPieceFlipInView(finished, pieceId, 1)).toBe(finished);

    const restarted = requestPieceFlip(finished, pieceId);
    expect(restarted.flippingPieceIds.get(pieceId)).toBe(2);
    expect(pieceFor(restarted, pieceId).flipRevision).toBe(2);
    expect(pieceFor(restarted, pieceId).items).toEqual(pieceFor(initial, pieceId).items);
    expect(restarted.table.nextEventNumber).toBe(started.table.nextEventNumber + 1);
    expect(finishPieceFlipInView(restarted, pieceId, 1)).toBe(restarted);
    expect(requestPieceFlip(restarted, pieceId)).toBe(restarted);
  });

  test('finishing one object does not unlock another', () => {
    const started = requestPieceFlip(requestPieceFlip(freshView(), 'treachery-deck'), 'harkonnen-force-stack');
    const finished = finishPieceFlipInView(started, 'treachery-deck', 1);

    expect([...finished.flippingPieceIds]).toEqual([['harkonnen-force-stack', 1]]);
    expect(requestPieceFlip(finished, 'harkonnen-force-stack')).toBe(finished);
    expect(finished.table).toBe(started.table);
  });
});

describe('rejected flips do not acquire animation locks', () => {
  test.each(['locked', 'permissions', 'draft'] as const)('does not lock an object rejected for %s', (reason) => {
    const initial = requestPieceFlip(freshView(), 'harkonnen-force-loose');
    const targetId = 'treachery-deck';
    const target = pieceFor(initial, targetId);
    if (reason === 'locked') {
      target.locked = true;
    }
    if (reason === 'permissions') {
      initial.table.enforcement = 'strict';
      target.owner = 'atreides';
    }
    if (reason === 'draft') {
      initial.table.draftMove = draftForGesture(target, 'whole');
      expect(initial.table.draftMove).not.toBeNull();
    }

    const rejected = requestPieceFlip(initial, targetId);

    expect(rejected.table.events[0]?.status).toBe('rejected');
    expect(rejected.table.pieces).toBe(initial.table.pieces);
    expect(pieceFor(rejected, targetId)).toBe(target);
    expect(target.flipRevision).toBe(0);
    expect(rejected.flippingPieceIds).toBe(initial.flippingPieceIds);
    expect([...rejected.flippingPieceIds]).toEqual([['harkonnen-force-loose', 1]]);
  });

  test.each(['missing', 'empty', 'marker', 'no selection'] as const)(
    'does not lock an invalid target with %s',
    (reason) => {
      const initial = freshView();
      const target = pieceFor(initial, 'treachery-deck');
      if (reason === 'empty') {
        target.items = [];
      }
      if (reason === 'marker') {
        target.kind = 'marker';
      }
      initial.table.selectedPieceId = null;
      const targetId = reason === 'missing' ? 'missing-piece' : reason === 'no selection' ? undefined : target.id;

      expect(requestPieceFlip(initial, targetId)).toBe(initial);
      expect(initial.flippingPieceIds.size).toBe(0);
    }
  );
});
