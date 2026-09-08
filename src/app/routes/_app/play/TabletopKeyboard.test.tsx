/* @vitest-environment jsdom */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TabletopProvider, useTabletop } from './TabletopContext';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function key(type: 'keydown' | 'keyup', value: string, repeat = false) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent(type, { key: value, repeat }));
  });
}

function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}

describe('number-key stack draws', () => {
  test('holds the original target across hover and state changes and draws only once', () => {
    const { result } = renderHook(() => useTabletop(), { wrapper: TabletopProvider });
    const originalPieces = result.current.state.pieces;
    const stack = () => result.current.state.pieces.find((piece) => piece.id === 'harkonnen-force-stack');
    const splits = () => result.current.state.events.filter((event) => event.command === 'stack.split');

    key('keydown', '2');
    advance(400);
    act(() => result.current.setHoveredPiece('treachery-deck'));
    advance(200);
    act(() => result.current.moveStormBy(1));
    key('keyup', '3');
    key('keydown', '2', true);
    advance(399);
    expect(stack()?.items).toHaveLength(5);
    expect(splits()).toHaveLength(0);

    advance(1);
    expect(stack()?.items).toHaveLength(3);
    expect(result.current.selectedPiece?.items).toHaveLength(2);
    expect(result.current.state.pieces).toHaveLength(originalPieces.length + 1);
    expect(splits()).toHaveLength(1);
    expect(result.current.state.pieces.find((piece) => piece.id === 'treachery-deck')?.items).toEqual(
      originalPieces.find((piece) => piece.id === 'treachery-deck')?.items
    );

    key('keydown', '2', true);
    advance(1000);
    key('keyup', '2');
    expect(splits()).toHaveLength(1);
    expect(stack()?.items).toHaveLength(3);
  });

  test('does not split or cancel a carry started during the number hold', () => {
    const { result } = renderHook(() => useTabletop(), { wrapper: TabletopProvider });
    const originalPieces = result.current.state.pieces;

    key('keydown', '2');
    advance(400);
    act(() => result.current.beginGesture('harkonnen-force-stack', 'whole'));
    const heldMove = result.current.state.draftMove;
    expect(heldMove?.pieceId).toBe('harkonnen-force-stack');

    advance(600);
    key('keyup', '2');
    expect(result.current.state.draftMove).toEqual(heldMove);
    expect(result.current.gestureActivePieceId).toBe('harkonnen-force-stack');
    expect(result.current.state.pieces).toEqual(originalPieces);
    expect(result.current.state.events.some((event) => event.command === 'stack.split')).toBe(false);
  });

  test.each(['keyup', 'blur', 'unmount'] as const)('cancels a pending draw on %s', (cancel) => {
    const { result, unmount } = renderHook(() => useTabletop(), { wrapper: TabletopProvider });
    const originalPieces = result.current.state.pieces;

    key('keydown', '2');
    advance(500);
    act(() => result.current.setHoveredPiece('treachery-deck'));
    expect(vi.getTimerCount()).toBe(1);

    if (cancel === 'keyup') {
      key('keyup', '2');
    } else if (cancel === 'blur') {
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });
    } else {
      unmount();
    }

    expect(vi.getTimerCount()).toBe(0);
    advance(1000);
    expect(result.current.state.pieces).toEqual(originalPieces);
    expect(result.current.state.events.some((event) => event.command === 'stack.split')).toBe(false);
  });
});
