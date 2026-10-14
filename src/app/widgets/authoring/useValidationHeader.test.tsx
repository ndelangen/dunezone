// @vitest-environment jsdom

import { act, fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

import { useValidationHeader } from './useValidationHeader';

function headerWith(count: number) {
  return renderHook(({ warnings }) => useValidationHeader(warnings), { initialProps: { warnings: count } });
}

describe('the hold the header exists for', () => {
  test('warnings open it on arrival', () => {
    const { result, rerender } = headerWith(0);
    expect(result.current.open).toBe(false);
    rerender({ warnings: 2 });
    expect(result.current.open).toBe(true);
  });

  test('an emptied list alone does not close it, which is what keeps the band still mid-keystroke', () => {
    const { result, rerender } = headerWith(2);
    rerender({ warnings: 0 });
    expect(result.current.open).toBe(true);
  });

  test('a settle closes it once the list is empty', () => {
    const { result, rerender } = headerWith(2);
    rerender({ warnings: 0 });
    act(() => result.current.settle());
    expect(result.current.open).toBe(false);
  });

  test('a settle while warnings stand leaves it open', () => {
    const { result, rerender } = headerWith(2);
    act(() => result.current.settle());
    expect(result.current.open).toBe(true);
    rerender({ warnings: 1 });
    expect(result.current.open).toBe(true);
  });

  test('a pointer blur keeps the band still until the target receives its click', () => {
    const { result, rerender } = headerWith(1);
    rerender({ warnings: 0 });
    fireEvent(window, new MouseEvent('pointerdown', { button: 0 }));
    act(() => result.current.settle());
    expect(result.current.open).toBe(true);
    const target = document.body.appendChild(document.createElement('button'));
    let openWhenClicked: boolean | undefined;
    target.onclick = () => {
      openWhenClicked = result.current.open;
    };
    fireEvent.click(target);
    target.remove();
    expect(openWhenClicked).toBe(true);
    expect(result.current.open).toBe(false);
  });

  test('a cancelled pointer releases a held settle without needing a click', () => {
    const { result, rerender } = headerWith(1);
    rerender({ warnings: 0 });
    fireEvent(window, new MouseEvent('pointerdown', { button: 0 }));
    act(() => result.current.settle());
    expect(result.current.open).toBe(true);
    fireEvent(window, new Event('pointercancel'));
    expect(result.current.open).toBe(false);
  });

  test('a secondary pointer cancellation leaves the primary click target still', () => {
    const { result, rerender } = headerWith(1);
    rerender({ warnings: 0 });
    fireEvent(window, new MouseEvent('pointerdown', { button: 0 }));
    act(() => result.current.settle());
    const cancellation = new Event('pointercancel');
    Object.defineProperty(cancellation, 'isPrimary', { value: false });
    fireEvent(window, cancellation);
    expect(result.current.open).toBe(true);
    fireEvent.click(window);
    expect(result.current.open).toBe(false);
  });

  test('pointer-up releases a held settle after a click that stops bubbling', () => {
    vi.useFakeTimers();
    try {
      const { result, rerender } = headerWith(1);
      rerender({ warnings: 0 });
      fireEvent(window, new MouseEvent('pointerdown', { button: 0 }));
      act(() => result.current.settle());
      fireEvent(window, new MouseEvent('pointerup', { button: 0 }));
      expect(result.current.open).toBe(true);
      act(() => vi.runAllTimers());
      expect(result.current.open).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a release is a settle that survives the warnings clearing later', () => {
  test('a release closes it when the action empties the list', () => {
    const { result, rerender } = headerWith(2);
    let replaced = false;
    act(() => result.current.releasing(() => (replaced = true))());
    expect(replaced).toBe(true);
    rerender({ warnings: 0 });
    expect(result.current.open).toBe(false);
  });

  test('the release still lands when the list only empties several renders later', () => {
    /* The membership mutation's shape: the action returns at once and the warning it clears
       disappears only when the server's next result arrives. */
    const { result, rerender } = headerWith(2);
    act(() => result.current.releasing(() => undefined)());
    rerender({ warnings: 2 });
    expect(result.current.open).toBe(true);
    rerender({ warnings: 1 });
    expect(result.current.open).toBe(true);
    rerender({ warnings: 0 });
    expect(result.current.open).toBe(false);
  });

  test('a release whose warnings never clear leaves the band standing', () => {
    const { result, rerender } = headerWith(2);
    act(() => result.current.releasing(() => undefined)());
    rerender({ warnings: 3 });
    expect(result.current.open).toBe(true);
  });

  test('the release is spent, so a later keystroke emptying the list does not close it', () => {
    const { result, rerender } = headerWith(2);
    act(() => result.current.releasing(() => undefined)());
    rerender({ warnings: 0 });
    expect(result.current.open).toBe(false);
    rerender({ warnings: 1 });
    expect(result.current.open).toBe(true);
    rerender({ warnings: 0 });
    expect(result.current.open).toBe(true);
  });

  test('the wrapped action keeps its arguments, since a load hands the picked draft through', () => {
    const { result } = headerWith(0);
    const seen: unknown[] = [];
    act(() => result.current.releasing((...args: unknown[]) => seen.push(...args))('atreides', 3));
    expect(seen).toEqual(['atreides', 3]);
  });
});
