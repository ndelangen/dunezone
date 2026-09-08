import { describe, expect, test } from 'vitest';

import type { TablePiece } from './model';
import {
  canAnimatePieceChange,
  CARD_LAYER_STAGGER,
  createPieceFlipMotion,
  PIECE_FLIP_DURATION_MS,
  pieceFlipFrame,
  retargetPieceFlipMotion,
  stackLayerItemIndex,
} from './pieceFlip';
import {
  CARD_LAYER_HEIGHT,
  CARD_LAYER_PITCH,
  CARD_WIDTH,
  FORCE_BOTTOM_RADIUS,
  FORCE_FACE_RADIUS,
  FORCE_TOP_RADIUS,
  pieceLabelHeight,
  stackTopHeight,
  visibleLayerCount,
} from './tableGeometry';

function pieceWithItems(kind: TablePiece['kind'], count: number, revision = 0): TablePiece {
  return {
    id: 'test-piece',
    label: 'Test piece',
    owner: 'neutral',
    color: '#754421',
    accent: '#e3ce91',
    items: Array.from({ length: count }, (_, index) => ({
      id: `item-${index}`,
      faceUp: index % 2 === 0,
    })),
    stackKey: 'test-stack',
    position: [0, 0, 0],
    orientation: 0,
    flipRevision: revision,
    zoneId: null,
    locked: false,
    kind,
  };
}

function flippedToRevision(piece: TablePiece, revision: number): TablePiece {
  const reversed = (revision - (piece.flipRevision ?? 0)) % 2 === 1;
  const items = reversed ? [...piece.items].reverse() : piece.items;
  return {
    ...piece,
    flipRevision: revision,
    items: items.map((item) => ({
      ...item,
      faceUp: reversed ? !item.faceUp : item.faceUp,
    })),
  };
}

function visibleBodyCorners(piece: TablePiece): [x: number, y: number][] {
  const shown = visibleLayerCount(piece);
  if (piece.kind !== 'card') {
    const radius = Math.max(FORCE_BOTTOM_RADIUS, FORCE_TOP_RADIUS, FORCE_FACE_RADIUS);
    return [
      [-radius, 0],
      [radius, 0],
      [-radius, stackTopHeight(piece)],
      [radius, stackTopHeight(piece)],
    ];
  }

  return Array.from({ length: shown }, (_, index) => {
    const x = (index - (shown - 1) / 2) * CARD_LAYER_STAGGER;
    const bottom = index * CARD_LAYER_PITCH;
    return [
      [x - CARD_WIDTH / 2, bottom],
      [x + CARD_WIDTH / 2, bottom],
      [x - CARD_WIDTH / 2, bottom + CARD_LAYER_HEIGHT],
      [x + CARD_WIDTH / 2, bottom + CARD_LAYER_HEIGHT],
    ] satisfies [number, number][];
  }).flat();
}

describe('compressed stack faces', () => {
  test.each(['card', 'force'] as const)('keeps the same sampled %s faces throughout each flip', (kind) => {
    for (let count = 1; count <= 200; count += 1) {
      const piece = pieceWithItems(kind, count);
      const shown = visibleLayerCount(piece);
      for (let revision = 0; revision < 4; revision += 1) {
        for (let layer = 0; layer < shown; layer += 1) {
          const before = stackLayerItemIndex(count, shown, layer, revision);
          const after = stackLayerItemIndex(count, shown, shown - 1 - layer, revision + 1);
          expect(before).toBe(count - 1 - after);
          expect(before).toBeGreaterThanOrEqual(0);
          expect(before).toBeLessThan(count);
        }
        expect(stackLayerItemIndex(count, shown, 0, revision)).toBe(0);
        expect(stackLayerItemIndex(count, shown, shown - 1, revision)).toBe(count - 1);
      }
    }
  });
});

describe('piece flip frames', () => {
  test.each([
    ['card', 1],
    ['card', 5],
    ['force', 1],
    ['force', 4],
  ] as const)('starts and ends a %s at exact resting heights for item count %i', (kind, count) => {
    const piece = pieceWithItems(kind, count);
    const motion = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 100);
    const start = pieceFlipFrame(motion, piece, 100);
    const end = pieceFlipFrame(motion, piece, 100 + PIECE_FLIP_DURATION_MS);

    expect(start.rotationZ).toBe(-Math.PI);
    expect(start.lift).toBe(0);
    expect(start.pivotY).toBe(stackTopHeight(piece) / 2);
    expect(start.labelY).toBeCloseTo(pieceLabelHeight(piece), 12);
    expect(start.shadowScale).toBe(1);
    expect(start.active).toBe(true);
    expect(end).toEqual({
      rotationZ: 0,
      lift: 0,
      pivotY: stackTopHeight(piece) / 2,
      labelY: pieceLabelHeight(piece),
      shadowScale: 1,
      active: false,
    });
    expect(pieceFlipFrame(motion, piece, 100 + PIECE_FLIP_DURATION_MS * 20)).toEqual(end);
  });

  test.each(['card', 'force'] as const)('lifts a %s onto its edge halfway through a flip', (kind) => {
    const piece = pieceWithItems(kind, 1);
    const motion = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 0);
    const frame = pieceFlipFrame(motion, piece, PIECE_FLIP_DURATION_MS / 2);
    const halfWidth =
      kind === 'card' ? CARD_WIDTH / 2 : Math.max(FORCE_BOTTOM_RADIUS, FORCE_TOP_RADIUS, FORCE_FACE_RADIUS);

    expect(frame.rotationZ).toBe(-Math.PI / 2);
    expect(frame.lift).toBeCloseTo(halfWidth + 0.06, 12);
    expect(frame.pivotY - halfWidth).toBeGreaterThan(0);
    expect(frame.labelY).toBeCloseTo(frame.pivotY + halfWidth + pieceLabelHeight(piece) - stackTopHeight(piece), 12);
    expect(frame.shadowScale).toBeCloseTo(1 + frame.lift * 0.35, 12);
    expect(frame.active).toBe(true);
  });

  for (const kind of ['card', 'force'] as const) {
    test.each([1, 2, 3, 4, 5, 30, 200])(
      `keeps all visible ${kind} corners above the board for item count %i`,
      (count) => {
        const piece = pieceWithItems(kind, count);
        const motion = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 0);
        const corners = visibleBodyCorners(piece);
        const height = stackTopHeight(piece);
        const labelGap = pieceLabelHeight(piece) - height;

        for (let sample = 0; sample <= 520; sample += 1) {
          const frame = pieceFlipFrame(motion, piece, (PIECE_FLIP_DURATION_MS * sample) / 520);
          const transformedHeights = corners.map(
            ([x, y]) => frame.pivotY + x * Math.sin(frame.rotationZ) + (y - height / 2) * Math.cos(frame.rotationZ)
          );

          expect(Math.min(...transformedHeights)).toBeGreaterThanOrEqual(-1e-12);
          expect(frame.labelY - Math.max(...transformedHeights)).toBeGreaterThanOrEqual(labelGap - 1e-12);
          expect(Object.values(frame).every((value) => typeof value === 'boolean' || Number.isFinite(value))).toBe(
            true
          );
        }
      }
    );
  }

  test('uses visible deck layers rather than hidden item count for its lift', () => {
    const motion = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 0);
    const visibleDeck = pieceWithItems('card', 5);
    const largeDeck = pieceWithItems('card', 200);

    expect(pieceFlipFrame(motion, largeDeck, PIECE_FLIP_DURATION_MS / 2)).toEqual(
      pieceFlipFrame(motion, visibleDeck, PIECE_FLIP_DURATION_MS / 2)
    );
    expect(CARD_LAYER_STAGGER).toBe(0.012);
  });

  test.each(['card', 'force', 'marker'] as const)('leaves an idle %s unchanged for any sample time', (kind) => {
    const piece = pieceWithItems(kind, 3, 17);
    const motion = createPieceFlipMotion(17);
    const idle = pieceFlipFrame(motion, piece, 0);

    for (const nowMs of [-Infinity, -1, 0, 1e12, Infinity, NaN]) {
      expect(pieceFlipFrame(motion, piece, nowMs)).toEqual(idle);
    }
    expect(idle.rotationZ).toBe(0);
    expect(idle.lift).toBe(0);
    expect(idle.shadowScale).toBe(1);
    expect(idle.active).toBe(false);
    expect(Object.values(idle).every((value) => typeof value === 'boolean' || Number.isFinite(value))).toBe(true);
  });

  test('never animates markers or empty pieces', () => {
    const motion = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 0);
    for (const piece of [pieceWithItems('marker', 1), pieceWithItems('card', 0), pieceWithItems('force', 0)]) {
      const frame = pieceFlipFrame(motion, piece, PIECE_FLIP_DURATION_MS / 2);
      expect(frame.rotationZ).toBe(0);
      expect(frame.lift).toBe(0);
      expect(frame.shadowScale).toBe(1);
      expect(frame.active).toBe(false);
    }
  });
});

describe('single piece flips', () => {
  test('preserves the running trajectory for the same revision', () => {
    const piece = pieceWithItems('card', 5);
    const initial = createPieceFlipMotion(0);
    const first = retargetPieceFlipMotion(initial, 1, 20);
    const nowMs = 20 + PIECE_FLIP_DURATION_MS * 0.37;
    const before = pieceFlipFrame(first, flippedToRevision(piece, 1), nowMs);
    const unchanged = retargetPieceFlipMotion(first, 1, nowMs);

    expect(unchanged).toBe(first);
    expect(pieceFlipFrame(unchanged, flippedToRevision(piece, 1), nowMs)).toEqual(before);
    expect(first).toEqual({ fromRevision: 0, targetRevision: 1, startedAt: 20 });
    expect(initial).toEqual(createPieceFlipMotion(0));
  });

  test.each([2, 3, 5])('settles an unexpected revision %i during a flip without queuing', (revision) => {
    const piece = pieceWithItems('card', 5);
    const first = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 20);
    const nowMs = 20 + PIECE_FLIP_DURATION_MS * 0.37;
    const settled = retargetPieceFlipMotion(first, revision, nowMs);

    expect(settled).toEqual(createPieceFlipMotion(revision));
    expect(first).toEqual({ fromRevision: 0, targetRevision: 1, startedAt: 20 });
    for (const sampleMs of [nowMs, 20 + PIECE_FLIP_DURATION_MS, 20 + PIECE_FLIP_DURATION_MS * 5]) {
      const frame = pieceFlipFrame(settled, flippedToRevision(piece, revision), sampleMs);
      expect(frame.rotationZ).toBe(0);
      expect(frame.lift).toBe(0);
      expect(frame.active).toBe(false);
    }
  });

  test('settles skipped revisions instead of replaying turns', () => {
    const piece = pieceWithItems('force', 4, 7);
    const motion = retargetPieceFlipMotion(createPieceFlipMotion(7), 10, 0);

    expect(motion).toEqual(createPieceFlipMotion(10));
    for (const sampleMs of [0, PIECE_FLIP_DURATION_MS / 2, PIECE_FLIP_DURATION_MS * 3]) {
      const frame = pieceFlipFrame(motion, flippedToRevision(piece, 10), sampleMs);
      expect(frame.rotationZ).toBe(0);
      expect(frame.lift).toBe(0);
      expect(frame.active).toBe(false);
    }
  });

  test('starts the next single flip once the previous animation finishes', () => {
    const piece = pieceWithItems('card', 5);
    const first = retargetPieceFlipMotion(createPieceFlipMotion(0), 1, 100);
    const nowMs = 100 + PIECE_FLIP_DURATION_MS;
    const next = retargetPieceFlipMotion(first, 2, nowMs);

    expect(next).toEqual({ fromRevision: 1, targetRevision: 2, startedAt: nowMs });
    expect(pieceFlipFrame(next, flippedToRevision(piece, 2), nowMs).active).toBe(true);
    expect(pieceFlipFrame(next, flippedToRevision(piece, 2), nowMs + PIECE_FLIP_DURATION_MS).active).toBe(false);
    expect(retargetPieceFlipMotion(next, 2, nowMs + 10)).toBe(next);
  });

  test('does not render a saved multi-turn motion', () => {
    const piece = pieceWithItems('card', 5, 3);
    const motion = { fromRevision: 0, targetRevision: 3, startedAt: 0 };

    expect(pieceFlipFrame(motion, piece, PIECE_FLIP_DURATION_MS / 2).active).toBe(false);
    expect(pieceFlipFrame(motion, piece, PIECE_FLIP_DURATION_MS / 2).rotationZ).toBe(0);
  });

  test('resets on revision rollback and can reset motion immediately', () => {
    const piece = pieceWithItems('card', 5, 2);
    const motion = retargetPieceFlipMotion(createPieceFlipMotion(2), 3, 100);
    const rollback = retargetPieceFlipMotion(motion, 1, 200);
    const reset = createPieceFlipMotion(4);

    expect(rollback).toEqual(createPieceFlipMotion(1));
    expect(pieceFlipFrame(rollback, piece, 200).active).toBe(false);
    expect(pieceFlipFrame(reset, piece, 200).rotationZ).toBe(0);
    expect(pieceFlipFrame(reset, piece, 200).lift).toBe(0);
    expect(pieceFlipFrame(reset, piece, 200).active).toBe(false);
  });
});

describe('piece changes that preserve a flip', () => {
  test.each(['card', 'force'] as const)('accepts unchanged %s items and one consecutive flip', (kind) => {
    const piece = pieceWithItems(kind, 5, 4);

    expect(canAnimatePieceChange(piece, piece)).toBe(true);
    for (const revision of [4, 5]) {
      expect(canAnimatePieceChange(piece, flippedToRevision(piece, revision))).toBe(true);
    }
    expect(canAnimatePieceChange(piece, { ...piece, position: [1, 2, 3], locked: true })).toBe(true);
  });

  test.each(['card', 'force'] as const)('rejects skipped %s flip revisions even when item parity matches', (kind) => {
    const piece = pieceWithItems(kind, 5, 4);

    for (const revision of [6, 7, 8]) {
      expect(canAnimatePieceChange(piece, flippedToRevision(piece, revision))).toBe(false);
    }
  });

  test('treats missing revisions as zero', () => {
    const piece = pieceWithItems('card', 1);
    delete piece.flipRevision;

    expect(canAnimatePieceChange(piece, { ...piece, flipRevision: 0 })).toBe(true);
    expect(canAnimatePieceChange(piece, flippedToRevision(piece, 1))).toBe(true);
  });

  test('rejects splits, merges, and replacement pieces', () => {
    const piece = pieceWithItems('card', 4);

    expect(canAnimatePieceChange(piece, { ...piece, id: 'another-piece' })).toBe(false);
    expect(canAnimatePieceChange(piece, { ...piece, kind: 'force' })).toBe(false);
    expect(canAnimatePieceChange(piece, { ...piece, items: piece.items.slice(1) })).toBe(false);
    expect(canAnimatePieceChange(piece, { ...piece, items: [...piece.items, { id: 'extra', faceUp: true }] })).toBe(
      false
    );
    expect(canAnimatePieceChange(pieceWithItems('card', 0), pieceWithItems('card', 0))).toBe(false);
  });

  test('rejects face, order, or item changes that do not match the recorded flips', () => {
    const piece = pieceWithItems('card', 4);
    const once = flippedToRevision(piece, 1);

    expect(canAnimatePieceChange(piece, { ...once, flipRevision: 0 })).toBe(false);
    expect(canAnimatePieceChange(piece, { ...piece, flipRevision: 1 })).toBe(false);
    expect(canAnimatePieceChange(piece, { ...once, items: [...once.items].reverse() })).toBe(false);
    expect(
      canAnimatePieceChange(piece, {
        ...once,
        items: once.items.map((item) => ({ ...item, faceUp: !item.faceUp })),
      })
    ).toBe(false);
    expect(
      canAnimatePieceChange(piece, {
        ...piece,
        items: piece.items.map((item, index) => (index === 0 ? { ...item, id: 'replacement' } : item)),
      })
    ).toBe(false);
  });

  test('rejects rolled-back or invalid revisions', () => {
    const piece = pieceWithItems('force', 3, 4);

    for (const revision of [3, -1, 4.5, NaN, Infinity]) {
      expect(canAnimatePieceChange(piece, { ...piece, flipRevision: revision })).toBe(false);
    }
    expect(canAnimatePieceChange({ ...piece, flipRevision: NaN }, piece)).toBe(false);
  });
});
