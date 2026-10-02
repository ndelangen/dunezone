// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { SERVER_WAIT_MS, useServerUnreachable } from './useServerUnreachable';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

test('a wait reads as unreachable only once it has lasted the whole timeout, and an answer clears it', () => {
  const { result, rerender } = renderHook(({ waiting }) => useServerUnreachable(waiting), {
    initialProps: { waiting: true },
  });
  act(() => vi.advanceTimersByTime(SERVER_WAIT_MS - 1));
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1));
  expect(result.current).toBe(true);
  rerender({ waiting: false });
  expect(result.current).toBe(false);
  /* A new wait starts its own timeout instead of inheriting the last one. */
  rerender({ waiting: true });
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(SERVER_WAIT_MS));
  expect(result.current).toBe(true);
});

test('a page that never waits never reads as unreachable', () => {
  const { result } = renderHook(() => useServerUnreachable(false));
  act(() => vi.advanceTimersByTime(SERVER_WAIT_MS * 3));
  expect(result.current).toBe(false);
});
