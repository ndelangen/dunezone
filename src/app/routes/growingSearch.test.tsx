// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { expect, test } from 'vite-plus/test';

import { useGrowingLimit, useGrowingSearch } from './growingSearch';

test('load more keeps the previous answer while loading and resets for a new search', () => {
  const first = ['Atreides', 'Harkonnen'];
  const longer = [...first, 'Fremen', 'Emperor'];
  const other = ['Ixians'];
  const { result, rerender } = renderHook(
    ({ query, live, initial }: { query: string; live: string[] | undefined; initial: string[] }) => {
      const search = useGrowingLimit({ query }, 2);
      return {
        limit: search.limit,
        ...useGrowingSearch({ search, live, initial, rows: (data) => data.length }),
      };
    },
    { initialProps: { query: '', live: first as string[] | undefined, initial: first } }
  );
  expect(result.current.limit).toBe(2);
  act(() => result.current.loadMore());
  expect(result.current.limit).toBe(4);
  rerender({ query: '', live: undefined, initial: first });
  expect(result.current.data).toBe(first);
  expect(result.current.loading).toBe(true);
  expect(result.current.loaded).toBe(false);
  rerender({ query: '', live: longer, initial: first });
  expect(result.current.data).toBe(longer);
  expect(result.current.loaded).toBe(true);
  expect(result.current.grown.from).toBe(2);
  rerender({ query: 'Ix', live: undefined, initial: other });
  expect(result.current.limit).toBe(2);
  expect(result.current.data).toBe(other);
  expect(result.current.loading).toBe(false);
  expect(result.current.loaded).toBe(false);
  rerender({ query: '', live: undefined, initial: first });
  expect(result.current.limit).toBe(2);
  expect(result.current.data).toBe(first);
});

test('a settled null answer stays null while a later answer is loading', () => {
  type Data = string[] | null;
  const initial = ['Atreides'];
  const { result, rerender } = renderHook(
    ({ live }: { live: Data | undefined }) => {
      const search = useGrowingLimit({ query: '' }, 2);
      return useGrowingSearch<Data>({ search, live, initial, rows: (data) => data?.length ?? 0 });
    },
    { initialProps: { live: initial as Data | undefined } }
  );
  expect(result.current.data).toBe(initial);
  rerender({ live: null });
  expect(result.current.data).toBeNull();
  rerender({ live: undefined });
  expect(result.current.data).toBeNull();
});
