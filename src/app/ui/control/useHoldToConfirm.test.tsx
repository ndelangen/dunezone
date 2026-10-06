/* @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import type { KeyboardEvent } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { useHoldToConfirm } from './useHoldToConfirm';

afterEach(() => vi.useRealTimers());

test('a blocked hold cannot start before the action becomes available', () => {
  vi.useFakeTimers();
  const onConfirm = vi.fn();
  const { result, rerender, unmount } = renderHook(
    ({ blocked }) => useHoldToConfirm({ pending: false, onConfirm, blocked }),
    { initialProps: { blocked: true } }
  );
  const press = { key: 'Enter', repeat: false, preventDefault: vi.fn() } as unknown as KeyboardEvent<HTMLElement>;
  act(() => result.current.handlers.onKeyDown(press));
  act(() => vi.advanceTimersByTime(5000));
  expect(onConfirm).not.toHaveBeenCalled();

  rerender({ blocked: false });
  act(() => result.current.handlers.onKeyDown(press));
  act(() => vi.advanceTimersByTime(5000));
  expect(onConfirm).toHaveBeenCalledTimes(1);
  unmount();
});
