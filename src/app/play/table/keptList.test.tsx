// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, test } from 'vite-plus/test';

import { useKeptList } from './keptList';

afterEach(cleanup);

type Entry = Readonly<{ seat: string; unread: number }>;

function keptOver(first: readonly Entry[]) {
  return renderHook(({ items }: { items: readonly Entry[] }) => useKeptList(items), { initialProps: { items: first } });
}

test('a list rebuilt with the same fields is the list kept before', () => {
  const { result, rerender } = keptOver([{ seat: 'a', unread: 0 }]);
  const first = result.current;
  rerender({ items: [{ seat: 'a', unread: 0 }] });
  expect(result.current).toBe(first);
});

test('a changed entry is new, while the entries beside it stay the ones kept', () => {
  const { result, rerender } = keptOver([
    { seat: 'a', unread: 0 },
    { seat: 'b', unread: 0 },
  ]);
  const [a, b] = result.current;
  rerender({
    items: [
      { seat: 'a', unread: 0 },
      { seat: 'b', unread: 2 },
    ],
  });
  expect(result.current[0]).toBe(a);
  expect(result.current[1]).not.toBe(b);
  expect(result.current[1]).toEqual({ seat: 'b', unread: 2 });
});

test('a longer or shorter list is a new list', () => {
  const { result, rerender } = keptOver([{ seat: 'a', unread: 0 }]);
  const first = result.current;
  rerender({ items: [] });
  expect(result.current).not.toBe(first);
  expect(result.current).toEqual([]);
});

test('an entry that gains a field is new', () => {
  const { result, rerender } = keptOver([{ seat: 'a', unread: 0 }]);
  const [a] = result.current;
  rerender({ items: [{ seat: 'a', unread: 0, vote: 'v' } as Entry] });
  expect(result.current[0]).not.toBe(a);
});
