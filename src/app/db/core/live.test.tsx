// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from 'vite-plus/test';

const mocks = vi.hoisted(() => ({
  answers: new Map<string, unknown>(),
  client: {},
  keepWarm: vi.fn(),
}));

vi.mock('convex/react', () => ({
  useConvex: () => mocks.client,
  useQueries: ({ held }: { held: { args: { address: string } } }) => ({
    held: mocks.answers.get(held.args.address),
  }),
  /* As in convex/react, a failed run is thrown after the subscription's hooks. */
  useQuery: (_query: unknown, args: { address: string }) => {
    const answer = mocks.answers.get(args.address);
    if (answer instanceof Error) {
      throw answer;
    }
    return answer;
  },
}));
vi.mock('./warm', () => ({ keepWarm: mocks.keepWarm, PAGE_HOLD_MS: 0 }));

import { act, renderHook } from '@testing-library/react';
import { makeFunctionReference } from 'convex/server';

import { useHeldLiveQuery, useLiveOperation, useLiveQuery } from './live';

const query = makeFunctionReference<'query', { address: string }, { status: string }>('playGames:getGameByAddress');
const ready = { status: 'ready' };
const timedOut = new Error('Function execution timed out (maximum duration: 3s)');

beforeEach(() => {
  mocks.answers = new Map();
  mocks.keepWarm.mockClear();
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

describe('page query warm holds', () => {
  test('keeps equal arguments subscribed without refreshing their hold on every render', () => {
    const { rerender, unmount } = renderHook(({ address }) => useLiveQuery(query, { address }), {
      initialProps: { address: 'arrakeen' },
    });
    expect(mocks.keepWarm).toHaveBeenCalledTimes(1);
    rerender({ address: 'arrakeen' });
    expect(mocks.keepWarm).toHaveBeenCalledTimes(1);
    rerender({ address: 'carthag' });
    expect(mocks.keepWarm).toHaveBeenCalledTimes(3);
    expect(mocks.keepWarm.mock.calls.map((call) => call[2])).toEqual([
      { address: 'arrakeen' },
      { address: 'arrakeen' },
      { address: 'carthag' },
    ]);
    unmount();
    expect(mocks.keepWarm).toHaveBeenCalledTimes(4);
  });

  test('typing searches never create warm holds', () => {
    const { rerender, unmount } = renderHook(({ address }) => useLiveQuery(query, { address }, { hold: false }), {
      initialProps: { address: 'arr' },
    });
    rerender({ address: 'arrak' });
    unmount();
    expect(mocks.keepWarm).not.toHaveBeenCalled();
  });
});

test('held queries wait for new arguments, recover, and retain only that argument answer on failure', () => {
  mocks.answers.set('arrakeen', ready);
  const { result, rerender } = renderHook(({ address }) => useHeldLiveQuery(query, { address }), {
    initialProps: { address: 'arrakeen' },
  });
  rerender({ address: 'carthag' });
  expect(result.current).toBeUndefined();
  const carthag = { status: 'setting-up' };
  mocks.answers.set('carthag', carthag);
  rerender({ address: 'carthag' });
  expect(result.current).toBe(carthag);
  mocks.answers.set('carthag', timedOut);
  rerender({ address: 'carthag' });
  expect(result.current).toBe(carthag);
  const recovered = { status: 'playing' };
  mocks.answers.set('carthag', recovered);
  rerender({ address: 'carthag' });
  expect(result.current).toBe(recovered);
  mocks.answers.set('arrakeen', timedOut);
  expect(() => rerender({ address: 'arrakeen' })).toThrow(timedOut);
});

test('warm keys round-trip Convex bigint and bytes arguments without re-subscribing equal values', () => {
  const binaryQuery = makeFunctionReference<'query', { nonce: bigint; bytes: ArrayBuffer }, null>('assets:binary');
  const { rerender, unmount } = renderHook(
    ({ nonce, bytes }) => useLiveQuery(binaryQuery, { nonce, bytes: new Uint8Array(bytes).buffer }),
    { initialProps: { nonce: 123n, bytes: [1, 2, 3] } }
  );
  expect(mocks.keepWarm).toHaveBeenCalledTimes(1);
  expect(mocks.keepWarm.mock.calls[0]?.[2]).toEqual({ nonce: 123n, bytes: new Uint8Array([1, 2, 3]).buffer });
  rerender({ nonce: 123n, bytes: [1, 2, 3] });
  expect(mocks.keepWarm).toHaveBeenCalledTimes(1);
  rerender({ nonce: 124n, bytes: [1, 2, 3] });
  expect(mocks.keepWarm).toHaveBeenCalledTimes(3);
  unmount();
});

test('operations settle pending state after success and normalized failure', async () => {
  let finish: (value: string) => void = () => {};
  const operation = vi.fn(
    (_value: string) =>
      new Promise<string>((resolve) => {
        finish = resolve;
      })
  );
  const { result } = renderHook(() => useLiveOperation(operation));
  let completion = Promise.resolve('');
  act(() => {
    completion = result.current.mutateAsync('draft');
  });
  expect(result.current.isPending).toBe(true);
  await act(async () => {
    finish('saved');
    expect(await completion).toBe('saved');
  });
  expect(result.current.isPending).toBe(false);
  expect(result.current.data).toBe('saved');
  operation.mockRejectedValueOnce('Service unavailable');
  await act(async () => {
    await expect(result.current.mutateAsync('draft')).rejects.toThrow('Service unavailable');
  });
  expect(result.current.isPending).toBe(false);
  expect(result.current.isError).toBe(true);
  expect(result.current.error?.message).toBe('Service unavailable');
  act(() => result.current.reset());
  expect(result.current.isError).toBe(false);
  expect(result.current.data).toBeUndefined();
});
