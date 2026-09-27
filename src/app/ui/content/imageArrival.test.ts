import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/* The gate is module state, so each test takes a fresh copy of the module. */
async function freshArrival() {
  vi.resetModules();
  const { joinArrival } = await import('./imageArrival');
  return joinArrival;
}

describe('the arrival gate', () => {
  /* A reveal is a timer of its own, so each check steps one millisecond past the moment it is due. */
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('a decoded image waits for a still-loading image in its own tile, and the two arrive together', async () => {
    const joinArrival = await freshArrival();
    const revealed: string[] = [];
    const decodedFirst = joinArrival(0);
    const stillLoading = joinArrival(0);

    decodedFirst.ready(() => revealed.push('decoded first'));
    vi.advanceTimersByTime(400);
    expect(revealed).toEqual([]);

    stillLoading.ready(() => revealed.push('decoded later'));
    vi.advanceTimersByTime(1);
    expect(revealed).toEqual(['decoded first', 'decoded later']);
  });

  test('a still-loading image holds the images after it for at most 700 ms', async () => {
    const joinArrival = await freshArrival();
    const revealed: number[] = [];
    joinArrival(0);
    joinArrival(1).ready(() => revealed.push(performance.now()));

    vi.advanceTimersByTime(699);
    expect(revealed).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(revealed).toHaveLength(1);
  });

  test('a page of tiles decoded together has all arrived within 700 ms', async () => {
    const joinArrival = await freshArrival();
    const revealed: number[] = [];
    for (let order = 0; order < 60; order++) {
      joinArrival(order).ready(() => revealed.push(order));
    }

    vi.advanceTimersByTime(701);
    expect(revealed).toHaveLength(60);
  });
});
