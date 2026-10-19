/* @vitest-environment jsdom */

import type { TablePiece } from '@shared/play/model';
import { renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';

import { useTurnedDownFaces } from './turnedDownFaces';

const back = 'https://table.test/back.jpg';
const front = 'https://table.test/karama.jpg';
const card = (faceUp: boolean, flipRevision: number): TablePiece =>
  ({
    id: 'card',
    kind: 'card',
    flipRevision,
    items: [
      {
        id: 'item',
        faceUp,
        artwork: faceUp ? { front, back, type: 'treachery', name: 'Karama' } : { back },
      },
    ],
  }) as unknown as TablePiece;

test('a card turned face down keeps the face it showed until it turns again', () => {
  const { result, rerender } = renderHook(({ piece }) => useTurnedDownFaces(piece), {
    initialProps: { piece: card(true, 0) },
  });
  rerender({ piece: card(false, 1) });
  expect(result.current.items[0]?.faceUp).toBe(false);
  expect(result.current.items[0]?.artwork?.front).toBe(front);
  rerender({ piece: card(false, 1) });
  expect(result.current.items[0]?.artwork?.front).toBe(front);
});

test('a card that was never shown face up gains no face', () => {
  const { result, rerender } = renderHook(({ piece }) => useTurnedDownFaces(piece), {
    initialProps: { piece: card(false, 0) },
  });
  rerender({ piece: card(false, 2) });
  expect(result.current.items[0]?.artwork?.front).toBeUndefined();
});
