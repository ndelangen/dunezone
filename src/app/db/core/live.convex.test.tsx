// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { getFunctionName, makeFunctionReference } from 'convex/server';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vite-plus/test';

vi.mock('./warm', () => ({ keepWarm: vi.fn(), PAGE_HOLD_MS: 0 }));

import { useHeldLiveQuery } from './live';

test('held queries use the real Convex subscription through pending, answers, failures and argument changes', async () => {
  const client = new ConvexReactClient('https://example.convex.cloud');
  const query = makeFunctionReference<'query', { address: string }, { status: string } | null>(
    'playGames:getGameByAddress'
  );
  const answers = new Map<string, { status: string } | Error | null>();
  const listeners = new Set<() => void>();
  vi.spyOn(client, 'watchQuery').mockImplementation((...parameters) => {
    const [reference, args] = parameters;
    expect(getFunctionName(reference)).toBe('playGames:getGameByAddress');
    return {
      localQueryResult: () => {
        const answer = answers.get(String(args?.address));
        if (answer instanceof Error) {
          throw answer;
        }
        return answer;
      },
      onUpdate: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      localQueryLogs: () => undefined,
      journal: () => undefined,
    };
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConvexProvider client={client}>{children}</ConvexProvider>
  );
  const { result, rerender, unmount } = renderHook(({ address }) => useHeldLiveQuery(query, { address }), {
    wrapper,
    initialProps: { address: 'arrakeen' },
  });
  try {
    expect(result.current).toBeUndefined();
    const ready = { status: 'sign_in_required' };
    act(() => {
      answers.set('arrakeen', ready);
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current).toBe(ready);
    rerender({ address: 'arrakeen' });
    expect(result.current).toBe(ready);
    act(() => {
      answers.set('arrakeen', new Error('Function execution timed out'));
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current).toBe(ready);
    rerender({ address: 'carthag' });
    expect(result.current).toBeUndefined();
    const refused = { status: 'not_found' };
    act(() => {
      answers.set('carthag', refused);
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current).toBe(refused);
    act(() => {
      answers.set('carthag', null);
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current).toBeNull();
    act(() => {
      answers.set('carthag', new Error('Function execution timed out'));
      for (const listener of listeners) {
        listener();
      }
    });
    expect(result.current).toBeNull();
  } finally {
    unmount();
    await client.close();
  }
});
