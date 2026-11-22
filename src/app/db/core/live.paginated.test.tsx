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

const firstArgs = (slug: string) => ({ slug, paginationOpts: { numItems: 12, cursor: null } });
const paginatedReads = (subscribed: Args[]) => subscribed.filter((args) => args.paginationOpts.id !== undefined);

function renderDetail(slug = 'atreides') {
  const fake = fakeClient();
  const hook = renderHook(({ slug }) => useLivePaginatedQuery(query, { slug }, { initialNumItems: 12 }), {
    wrapper: fake.wrapper,
    initialProps: { slug },
  });
  return { ...fake, ...hook };
}

test("the first page subscribes with exactly the loader's arguments, so every visitor shares its cached answer", async () => {
  const { subscribed, answer, result, unmount, client } = renderDetail();
  try {
    expect(new Set(subscribed.map(keyOf))).toEqual(new Set([keyOf(firstArgs('atreides'))]));
    expect(result.current.status).toBe('LoadingFirstPage');
    answer(firstArgs('atreides'), page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    expect(result.current.status).toBe('CanLoadMore');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);
  } finally {
    unmount();
    await client.close();
  }
});

test('load more hands over to pagination: the first page once more, then the asked-for page after it', async () => {
  const { subscribed, answer, result, unmount, client } = renderDetail();
  try {
    answer(firstArgs('atreides'), page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    act(() => result.current.loadMore(12));
    const [paginatedFirst] = paginatedReads(subscribed);
    expect(paginatedFirst?.paginationOpts).toMatchObject({ numItems: 12, cursor: null });
    /* The shared first page stays on screen until pagination has its own. */
    expect(result.current.status).toBe('LoadingMore');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);

    answer(paginatedFirst!, page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    const following = paginatedReads(subscribed).find((args) => args.paginationOpts.cursor === 'next');
    expect(following?.paginationOpts).toMatchObject({ numItems: 12, cursor: 'next' });
    expect(result.current.status).toBe('LoadingMore');

    answer(following!, page({ detail: null, items: ['q3'] }, true));
    expect(result.current.status).toBe('Exhausted');
    expect(result.current.results.flatMap((chunk) => chunk.items)).toEqual(['q1', 'q2', 'q3']);
  } finally {
    unmount();
    await client.close();
  }
});

test('another address, or coming back to this one, starts on the shared first page again', async () => {
  const { subscribed, answer, result, rerender, unmount, client } = renderDetail();
  try {
    answer(firstArgs('atreides'), page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    act(() => result.current.loadMore(12));
    expect(result.current.status).toBe('LoadingMore');

    rerender({ slug: 'harkonnen' });
    answer(firstArgs('harkonnen'), page({ detail: 'Harkonnen', items: [] }, true));
    expect(result.current.status).toBe('Exhausted');
    expect(result.current.results).toEqual([{ detail: 'Harkonnen', items: [] }]);

    const readsBefore = new Set(paginatedReads(subscribed).map(keyOf)).size;
    rerender({ slug: 'atreides' });
    expect(result.current.status).toBe('CanLoadMore');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);
    expect(new Set(paginatedReads(subscribed).map(keyOf)).size).toBe(readsBefore);
  } finally {
    unmount();
    await client.close();
  }
});

test('load more does nothing once the first page holds everything', async () => {
  const { subscribed, answer, result, unmount, client } = renderDetail();
  try {
    answer(firstArgs('atreides'), page({ detail: 'Atreides', items: ['q1'] }, true));
    act(() => result.current.loadMore(12));
    expect(result.current.status).toBe('Exhausted');
    expect(paginatedReads(subscribed)).toEqual([]);
  } finally {
    unmount();
    await client.close();
  }
});

test('a first page cut short by a required split hands over to pagination and keeps the last whole answer on screen', async () => {
  const { subscribed, answer, wrapper, client } = fakeClient();
  const { result, unmount } = renderHook(
    () => useLivePaginatedQuery(query, { slug: 'atreides' }, { initialNumItems: 12 }),
    {
      wrapper,
    }
  );
  try {
    const firstArgs = { slug: 'atreides', paginationOpts: { numItems: 12, cursor: null } };
    answer(firstArgs, page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    expect(result.current.status).toBe('CanLoadMore');

    answer(firstArgs, {
      ...page({ detail: 'Atreides', items: ['q1'] }),
      pageStatus: 'SplitRequired',
      splitCursor: 'q1',
    });
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);
    expect(result.current.status).toBe('LoadingMore');
    const paginatedArgs = subscribed.find((args) => args.paginationOpts.id !== undefined);
    expect(paginatedArgs?.paginationOpts).toMatchObject({ numItems: 12, cursor: null });

    answer(paginatedArgs!, page({ detail: 'Atreides', items: ['q1', 'q2', 'q3'] }, true));
    expect(result.current.status).toBe('Exhausted');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2', 'q3'] }]);
  } finally {
    unmount();
    await client.close();
  }
});

test('pagination splitting its own first page keeps the whole answer on screen and still asks for the next page once', async () => {
  const { subscribed, answer, result, unmount, client } = renderDetail();
  try {
    answer(firstArgs('atreides'), page({ detail: 'Atreides', items: ['q1', 'q2'] }));
    act(() => result.current.loadMore(12));
    const [paginatedFirst] = paginatedReads(subscribed);
    answer(paginatedFirst!, {
      ...page({ detail: 'Atreides', items: ['q1'] }),
      pageStatus: 'SplitRequired',
      splitCursor: 'mid',
    });
    expect(result.current.status).toBe('LoadingMore');
    expect(result.current.results).toEqual([{ detail: 'Atreides', items: ['q1', 'q2'] }]);

    const halves = [
      ...new Map(
        paginatedReads(subscribed)
          .filter((args) => 'endCursor' in args.paginationOpts)
          .map((args) => [keyOf(args), args])
      ).values(),
    ];
    expect(halves).toHaveLength(2);
    for (const [index, half] of halves.entries()) {
      answer(half, {
        page: [{ detail: index === 0 ? 'Atreides' : null, items: [`q${index + 1}`] }],
        isDone: false,
        continueCursor: index === 0 ? 'mid' : 'next',
      });
    }
    const following = paginatedReads(subscribed).filter(
      (args) => args.paginationOpts.cursor === 'next' && !('endCursor' in args.paginationOpts)
    );
    expect(new Set(following.map(keyOf)).size).toBe(1);
    expect(following[0]?.paginationOpts).toMatchObject({ numItems: 12 });
    expect(result.current.status).toBe('LoadingMore');

    answer(following[0]!, page({ detail: null, items: ['q3'] }, true));
    expect(result.current.status).toBe('Exhausted');
    expect(result.current.results.flatMap((chunk) => chunk.items)).toEqual(['q1', 'q2', 'q3']);
  } finally {
    unmount();
    await client.close();
  }
});
