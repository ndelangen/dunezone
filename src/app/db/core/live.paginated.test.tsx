// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { makeFunctionReference } from 'convex/server';
import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vite-plus/test';

vi.mock('./warm', () => ({ keepWarm: vi.fn(), PAGE_HOLD_MS: 0 }));

import { useLivePaginatedQuery } from './live';

/* `id` is the cache-buster `usePaginatedQuery` adds; the loader's arguments never carry it. */
type Args = { slug: string; paginationOpts: PaginationOptions & { id?: number } };
type Chunk = { detail: string | null; items: string[] };

/* Argument order is not part of a query's identity, so answers and subscriptions are compared by sorted keys. */
const keyOf = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).toSorted(([a], [b]) => a.localeCompare(b)))
      : inner
  );

const query = makeFunctionReference<'query', Args, PaginationResult<Chunk>>('factions:detailPage');

function fakeClient() {
  const client = new ConvexReactClient('https://example.convex.cloud');
  const subscribed: Args[] = [];
  const answers = new Map<string, PaginationResult<Chunk>>();
  const listeners = new Set<() => void>();
  vi.spyOn(client, 'watchQuery').mockImplementation((...parameters) => {
    const args = parameters[1] as Args;
    subscribed.push(args);
    return {
      localQueryResult: () => answers.get(keyOf(args)),
      onUpdate: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      localQueryLogs: () => undefined,
      journal: () => undefined,
    };
  });
  const answer = (args: Args, result: PaginationResult<Chunk>) =>
    act(() => {
      answers.set(keyOf(args), result);
      for (const listener of listeners) {
        listener();
      }
    });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConvexProvider client={client}>{children}</ConvexProvider>
  );
  return { client, subscribed, answer, wrapper };
}

const page = (chunk: Chunk, isDone = false): PaginationResult<Chunk> => ({
  page: [chunk],
  isDone,
  continueCursor: 'next',
});

test("the first page subscribes with exactly the loader's arguments, so every visitor shares its cached answer", async () => {
  const { subscribed, answer, wrapper, client } = fakeClient();
  const { result, rerender, unmount } = renderHook(
    ({ slug }) => useLivePaginatedQuery(query, { slug }, { initialNumItems: 12 }),
    { wrapper, initialProps: { slug: 'atreides' } }
  );
  try {
    const firstArgs = { slug: 'atreides', paginationOpts: { numItems: 12, cursor: null } };
    expect(new Set(subscribed.map(keyOf))).toEqual(new Set([keyOf(firstArgs)]));
    expect(result.current.status).toBe('LoadingFirstPage');

    answer(firstArgs, page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    expect(result.current.status).toBe('CanLoadMore');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);

    act(() => result.current.loadMore(12));
    const paginatedArgs = subscribed.find((args) => args.paginationOpts.id !== undefined);
    expect(paginatedArgs?.paginationOpts).toMatchObject({ numItems: 24, cursor: null });
    /* The shared first page stays on screen until the paginated read answers. */
    expect(result.current.status).toBe('LoadingMore');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);

    answer(paginatedArgs!, page({ detail: 'Atreides', items: ['q1', 'q2', 'q3'] }, true));
    expect(result.current.status).toBe('Exhausted');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2', 'q3'] }]);

    /* Another address starts on its own shared first page again. */
    rerender({ slug: 'harkonnen' });
    const harkonnen = { slug: 'harkonnen', paginationOpts: { numItems: 12, cursor: null } };
    expect(subscribed.map(keyOf)).toContain(keyOf(harkonnen));
    answer(harkonnen, page({ detail: 'Harkonnen', items: [] }, true));
    expect(result.current.status).toBe('Exhausted');
    expect(result.current.results).toEqual([{ detail: 'Harkonnen', items: [] }]);
  } finally {
    unmount();
    await client.close();
  }
});
