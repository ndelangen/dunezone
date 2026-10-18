// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
}));

vi.mock('convex/react', () => ({
  useConvex: () => ({}),
  /* As in convex/react, a failed run is thrown after the subscription's hooks. */
  useQuery: (_query: unknown, args: { address: string }) => {
    const answer = mocks.answers.get(args.address);
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  },
}));
vi.mock('convex/server', () => ({
  getFunctionName: () => 'playGames:getGameByAddress',
}));
vi.mock('./warm', () => ({ keepWarm: () => {}, PAGE_HOLD_MS: 0 }));

import { renderHook } from '@testing-library/react';
import type { FunctionReference } from 'convex/server';

import { useHeldLiveQuery } from './live';

const query = {} as FunctionReference<'query', 'public', { address: string }, { status: string }>;
const ready = { status: 'ready' };
const timedOut = new Error('Function execution timed out (maximum duration: 3s)');

beforeEach(() => {
  mocks.answers = new Map();
});

describe('useHeldLiveQuery', () => {
  test('keeps the last answer through a failed re-run, then takes the next answer', () => {
    mocks.answers.set('arrakeen', ready);
    const { result, rerender } = renderHook(() => useHeldLiveQuery(query, { address: 'arrakeen' }));
    expect(result.current).toBe(ready);

    /* A directory publish re-runs the query and that execution times out: the open table must stay. */
    mocks.answers.set('arrakeen', timedOut);
    rerender();
    expect(result.current).toBe(ready);

    const refused = { status: 'not_found' };
    mocks.answers.set('arrakeen', refused);
    rerender();
    expect(result.current).toBe(refused);
  });

  test('throws a failure that arrives before any answer, as useLiveQuery does', () => {
    mocks.answers.set('arrakeen', timedOut);
    expect(() => renderHook(() => useHeldLiveQuery(query, { address: 'arrakeen' }))).toThrow(timedOut);
  });

  test('never holds one address answer over a failure at another', () => {
    mocks.answers.set('arrakeen', ready);
    mocks.answers.set('carthag', timedOut);
    const { rerender } = renderHook(({ address }) => useHeldLiveQuery(query, { address }), {
      initialProps: { address: 'arrakeen' },
    });
    expect(() => rerender({ address: 'carthag' })).toThrow(timedOut);
  });

  test('is pending while the subscription has not answered', () => {
    const { result } = renderHook(() => useHeldLiveQuery(query, { address: 'arrakeen' }));
    expect(result.current).toBeUndefined();
  });
});
