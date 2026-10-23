/* @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { makeFunctionReference } from 'convex/server';
import type { PropsWithChildren } from 'react';
import { expect, test, vi } from 'vite-plus/test';

import { api } from '../../../../convex/_generated/api';
import {
  ConvexStorybookWorkerContext,
  useConvexStorybookPaginatedQuery,
  useConvexStorybookQuery,
  useConvexStorybookQueries,
} from './runtime';
import type { ConvexStorybookWorkerClient } from './runtime';

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

test('a revision refresh preserves the current query value until its replacement arrives', async () => {
  const initial = [{ name: 'Initial ruleset' }];
  const replacement = [{ name: 'Replacement ruleset' }];
  const firstQuery = deferred<unknown>();
  const refreshedQuery = deferred<unknown>();
  const listeners = new Set<() => void>();
  let revision = 0;
  const query = vi.fn().mockReturnValueOnce(firstQuery.promise).mockReturnValueOnce(refreshedQuery.promise);
  const client = {
    getRevision: () => revision,
    query,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ConvexStorybookWorkerClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ConvexStorybookWorkerContext.Provider value={{ client }}>{children}</ConvexStorybookWorkerContext.Provider>
  );
  const hook = renderHook(() => useConvexStorybookQuery(api.rulesets.catalogue, {}), { wrapper });

  firstQuery.resolve(initial);
  await waitFor(() => expect(hook.result.current).toBe(initial));

  act(() => {
    revision += 1;
    for (const listener of listeners) {
      listener();
    }
  });
  expect(hook.result.current).toBe(initial);

  refreshedQuery.resolve(replacement);
  await waitFor(() => expect(hook.result.current).toBe(replacement));
  expect(query).toHaveBeenCalledTimes(2);
});

test('changed arguments clear the value and a retired request cannot replace the new answer', async () => {
  const oldRequest = deferred<string[]>();
  const newRequest = deferred<string[]>();
  const query = vi.fn().mockReturnValueOnce(oldRequest.promise).mockReturnValueOnce(newRequest.promise);
  const client = {
    getRevision: () => 0,
    query,
    subscribe: () => () => undefined,
  } as unknown as ConvexStorybookWorkerClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ConvexStorybookWorkerContext.Provider value={{ client }}>{children}</ConvexStorybookWorkerContext.Provider>
  );
  const reference = makeFunctionReference<'query', { scope: string }, string[]>('test:list');
  const hook = renderHook(({ scope }) => useConvexStorybookQuery(reference, { scope }), {
    wrapper,
    initialProps: { scope: 'old' },
  });
  hook.rerender({ scope: 'new' });
  expect(hook.result.current).toBeUndefined();
  newRequest.resolve(['new']);
  await waitFor(() => expect(hook.result.current).toEqual(['new']));
  await act(async () => oldRequest.resolve(['old']));
  expect(hook.result.current).toEqual(['new']);
});

test('a skipped page reads nothing and a new argument starts from its own first page', async () => {
  type Page = { page: string[]; isDone: boolean; continueCursor: string };
  const first = deferred<Page>();
  const more = deferred<Page>();
  const replacement = deferred<Page>();
  const query = vi.fn((_reference: unknown, args: { scope: string; paginationOpts: { cursor: string | null } }) =>
    args.scope === 'new' ? replacement.promise : args.paginationOpts.cursor === null ? first.promise : more.promise
  );
  const client = {
    getRevision: () => 0,
    query,
    subscribe: () => () => undefined,
  } as unknown as ConvexStorybookWorkerClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ConvexStorybookWorkerContext.Provider value={{ client }}>{children}</ConvexStorybookWorkerContext.Provider>
  );
  const reference = makeFunctionReference<
    'query',
    { scope: string; paginationOpts: { cursor: string | null; numItems: number } },
    Page
  >('test:pages');
  const hook = renderHook(
    ({ scope }: { scope: string | null }) =>
      useConvexStorybookPaginatedQuery(reference, scope === null ? 'skip' : { scope }, { initialNumItems: 2 }),
    {
      wrapper,
      initialProps: { scope: null as string | null },
    }
  );
  expect(hook.result.current.status).toBe('Exhausted');
  expect(query).not.toHaveBeenCalled();
  hook.rerender({ scope: 'old' });
  first.resolve({ page: ['old'], isDone: false, continueCursor: 'next' });
  await waitFor(() => expect(hook.result.current.status).toBe('CanLoadMore'));
  act(() => hook.result.current.loadMore(2));
  hook.rerender({ scope: 'new' });
  expect(hook.result.current.results).toEqual([]);
  expect(hook.result.current.status).toBe('LoadingFirstPage');
  replacement.resolve({ page: ['new'], isDone: true, continueCursor: '' });
  await waitFor(() => expect(hook.result.current.results).toEqual(['new']));
  await act(async () => more.resolve({ page: ['late old'], isDone: true, continueCursor: '' }));
  expect(hook.result.current.results).toEqual(['new']);
});

test('query batches return failures as values, clear changed arguments, and recover on refresh', async () => {
  const listeners = new Set<() => void>();
  let revision = 0;
  const error = new Error('Query timed out');
  let unavailable = true;
  const query = vi.fn((_reference: unknown, args: { scope: string }) =>
    unavailable && args.scope === 'failed' ? Promise.reject(error) : Promise.resolve(args.scope)
  );
  const client = {
    getRevision: () => revision,
    query,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ConvexStorybookWorkerClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ConvexStorybookWorkerContext.Provider value={{ client }}>{children}</ConvexStorybookWorkerContext.Provider>
  );
  const reference = makeFunctionReference<'query', { scope: string }, string>('test:batch');
  const hook = renderHook(
    ({ scope }) =>
      useConvexStorybookQueries({
        ready: { query: reference, args: { scope: 'ready' } },
        changing: { query: reference, args: { scope } },
      }),
    { wrapper, initialProps: { scope: 'failed' } }
  );
  expect(hook.result.current).toEqual({ ready: undefined, changing: undefined });
  await waitFor(() => expect(hook.result.current).toEqual({ ready: 'ready', changing: error }));
  act(() => {
    unavailable = false;
    revision += 1;
    for (const listener of listeners) {
      listener();
    }
  });
  expect(hook.result.current).toEqual({ ready: 'ready', changing: undefined });
  await waitFor(() => expect(hook.result.current.changing).toBe('failed'));
  hook.rerender({ scope: 'recovered' });
  expect(hook.result.current).toEqual({ ready: 'ready', changing: undefined });
  await waitFor(() => expect(hook.result.current.changing).toBe('recovered'));
  await waitFor(() => expect(query).toHaveBeenCalledTimes(6));
});

test('a lazy query reads nothing while skipped and drops the last value when closed', async () => {
  const query = vi.fn().mockResolvedValue(['ready']);
  const client = {
    getRevision: () => 0,
    query,
    subscribe: () => () => undefined,
  } as unknown as ConvexStorybookWorkerClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <ConvexStorybookWorkerContext.Provider value={{ client }}>{children}</ConvexStorybookWorkerContext.Provider>
  );
  const reference = makeFunctionReference<'query', Record<string, never>, string[]>('test:lazy');
  const hook = renderHook(({ open }) => useConvexStorybookQuery(reference, open ? {} : 'skip'), {
    wrapper,
    initialProps: { open: false },
  });
  expect(query).not.toHaveBeenCalled();
  expect(hook.result.current).toBeUndefined();
  hook.rerender({ open: true });
  await waitFor(() => expect(hook.result.current).toEqual(['ready']));
  hook.rerender({ open: false });
  expect(hook.result.current).toBeUndefined();
  expect(query).toHaveBeenCalledTimes(1);
});
