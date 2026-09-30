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

describe('the animation pool', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('six images animate while the next waits for an actual completion', async () => {
    const { requestArrivalAnimation } = await import('./imageArrival');
    const starts: [number, boolean][] = [];
    const releases = Array.from({ length: 8 }, (_, index) =>
      requestArrivalAnimation((animate) => starts.push([index, animate]))
    );
    expect(starts).toEqual(Array.from({ length: 6 }, (_, index) => [index, true]));
    releases[0]!();
    expect(starts.at(-1)).toEqual([6, true]);
    /* Releasing twice cannot spend the same slot twice. */
    releases[0]!();
    expect(starts).toHaveLength(7);
    releases[1]!();
    expect(starts.at(-1)).toEqual([7, true]);
    releases.forEach((release) => release());
  });

  test('a saturated queue shows decoded content still after 700 ms, and an unmounted image never starts', async () => {
    const { requestArrivalAnimation } = await import('./imageArrival');
    const releaseActive = Array.from({ length: 6 }, () => requestArrivalAnimation(() => undefined));
    const starts: boolean[] = [];
    const releaseWaiting = requestArrivalAnimation((animate) => starts.push(animate));
    const cancelled = vi.fn();
    requestArrivalAnimation(cancelled)();
    vi.advanceTimersByTime(700);
    expect(starts).toEqual([false]);
    expect(cancelled).not.toHaveBeenCalled();
    releaseActive.forEach((release) => release());
    releaseWaiting();
    expect(starts).toEqual([false]);
  });
});
