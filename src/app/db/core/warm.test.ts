import { makeFunctionReference } from 'convex/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { keepWarm, LOADER_HOLD_MS, PAGE_HOLD_MS, releaseAllHolds } from './warm';

const page = makeFunctionReference<'query', { slug: string }>('factions:pageBySlug');

function fakeClient() {
  const open = new Set<string>();
  const watchQuery = vi.fn((_fn: unknown, args: { slug: string }) => ({
    onUpdate: () => {
      open.add(args.slug);
      return () => open.delete(args.slug);
    },
  }));
  return { client: { watchQuery } as never, watchQuery, open };
}

describe('keepWarm', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    /* Every hold expires on its own; running the timers out leaves no subscription for the next test. */
    vi.runAllTimers();
    vi.useRealTimers();
  });

  test('a hold subscribes once and lets go when it expires', () => {
    const { client, watchQuery, open } = fakeClient();
    keepWarm(client, page, { slug: 'atreides' }, LOADER_HOLD_MS);
    keepWarm(client, page, { slug: 'atreides' }, LOADER_HOLD_MS);
    expect(watchQuery).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LOADER_HOLD_MS - 1);
    expect(open.has('atreides')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(open.has('atreides')).toBe(false);
  });

  test('signing in or out lets go of every hold at once', () => {
    const { client, watchQuery, open } = fakeClient();
    keepWarm(client, page, { slug: 'atreides' }, PAGE_HOLD_MS);
    keepWarm(client, page, { slug: 'harkonnen' }, LOADER_HOLD_MS);
    releaseAllHolds();
    expect(open.size).toBe(0);
    keepWarm(client, page, { slug: 'atreides' }, LOADER_HOLD_MS);
    expect(watchQuery).toHaveBeenCalledTimes(3);
  });

  test('a shorter hold never cuts a longer one short', () => {
    const { client, open } = fakeClient();
    keepWarm(client, page, { slug: 'harkonnen' }, PAGE_HOLD_MS);
    keepWarm(client, page, { slug: 'harkonnen' }, LOADER_HOLD_MS);
    vi.advanceTimersByTime(PAGE_HOLD_MS - 1);
    expect(open.has('harkonnen')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(open.has('harkonnen')).toBe(false);
  });

  test('past the limit the least recently held query is released first', () => {
    const { client, open } = fakeClient();
    for (let index = 0; index < 32; index++) {
      keepWarm(client, page, { slug: `faction-${index}` }, PAGE_HOLD_MS);
    }
    keepWarm(client, page, { slug: 'faction-0' }, PAGE_HOLD_MS);
    keepWarm(client, page, { slug: 'fremen' }, PAGE_HOLD_MS);
    expect(open.has('faction-0')).toBe(true);
    expect(open.has('faction-1')).toBe(false);
    expect(open.size).toBe(32);
  });

  test('without a client, as during server rendering, nothing is held', () => {
    expect(() => keepWarm(undefined, page, { slug: 'emperor' }, PAGE_HOLD_MS)).not.toThrow();
  });
});
