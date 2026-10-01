import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { loadPublishedFace, sharedPublishedFaces } from './publishedFaceRetry';

/** A loader whose every request stays open until the test settles it. */
function pendingLoader() {
  const requests: { at: number; succeed: (value: string) => void; fail: () => void }[] = [];
  const load = vi.fn((onLoad: (value: string) => void, onError: () => void) => {
    requests.push({ at: Date.now(), succeed: onLoad, fail: onError });
  });
  return { load, requests };
}

beforeEach(() => {
  vi.useFakeTimers({ now: 0 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadPublishedFace', () => {
  test('two failures then a success load the face once, retrying after 5 s and then 10 s', () => {
    const { load, requests } = pendingLoader();
    const onLoad = vi.fn();
    const release = vi.fn();
    loadPublishedFace({ load, onLoad, release });

    requests[0]!.fail();
    vi.advanceTimersByTime(4999);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    requests[1]!.fail();
    vi.advanceTimersByTime(9999);
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1);
    requests[2]!.succeed('face');
    vi.advanceTimersByTime(120_000);

    expect(requests.map((request) => request.at)).toEqual([0, 5000, 15_000]);
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith('face');
    expect(release).not.toHaveBeenCalled();
  });

  test('the retry delay doubles up to 60 s and stays there', () => {
    const { load, requests } = pendingLoader();
    loadPublishedFace({ load, onLoad: vi.fn(), release: vi.fn() });

    for (let attempt = 0; attempt < 7; attempt += 1) {
      requests[attempt]!.fail();
      vi.runOnlyPendingTimers();
    }

    const delays = requests.slice(1).map((request, index) => request.at - requests[index]!.at);
    expect(delays).toEqual([5000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000]);
  });

  test('equal first and maximum delays retry at a fixed interval', () => {
    const { load, requests } = pendingLoader();
    loadPublishedFace({ load, onLoad: vi.fn(), release: vi.fn(), firstDelayMs: 10_000, maxDelayMs: 10_000 });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      requests[attempt]!.fail();
      vi.runOnlyPendingTimers();
    }

    expect(requests.map((request) => request.at)).toEqual([0, 10_000, 20_000, 30_000]);
  });

  test('disposing cancels the pending retry and releases a face that arrives afterwards', () => {
    const { load, requests } = pendingLoader();
    const onLoad = vi.fn();
    const release = vi.fn();
    const dispose = loadPublishedFace({ load, onLoad, release });

    requests[0]!.fail();
    dispose();
    vi.advanceTimersByTime(120_000);
    expect(load).toHaveBeenCalledTimes(1);

    const late = loadPublishedFace({ load, onLoad, release });
    late();
    requests[1]!.succeed('late face');
    requests[1]!.fail();
    vi.advanceTimersByTime(120_000);

    expect(load).toHaveBeenCalledTimes(2);
    expect(onLoad).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledExactlyOnceWith('late face');
  });

  test('disposing releases the loaded face', () => {
    const { load, requests } = pendingLoader();
    const release = vi.fn();
    const dispose = loadPublishedFace({ load, onLoad: vi.fn(), release });
    requests[0]!.succeed('face');

    dispose();

    expect(release).toHaveBeenCalledExactlyOnceWith('face');
  });

  test('an injected timer schedules the retries', () => {
    const { load, requests } = pendingLoader();
    const timer = { set: vi.fn(() => setTimeout(() => {}, 0)), clear: vi.fn() };
    const dispose = loadPublishedFace({ load, onLoad: vi.fn(), release: vi.fn(), timer });

    requests[0]!.fail();
    dispose();

    expect(timer.set).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 5000);
    expect(timer.clear).toHaveBeenCalledExactlyOnceWith(timer.set.mock.results[0]!.value);
  });
});

describe('sharedPublishedFaces', () => {
  function sharedLoader() {
    const requests: { key: string; succeed: (value: string) => void; fail: () => void }[] = [];
    const load = vi.fn((key: string, onLoad: (value: string) => void, onError: () => void) => {
      requests.push({ key, succeed: onLoad, fail: onError });
    });
    const release = vi.fn();
    return { load, release, requests, subscribe: sharedPublishedFaces({ load, release }) };
  }

  test('subscribers of one key share a single load, including one that arrives after it finished', () => {
    const { load, requests, subscribe } = sharedLoader();
    const first = vi.fn();
    const second = vi.fn();
    subscribe('front', first);
    subscribe('front', second);
    requests[0]!.succeed('face');
    const late = vi.fn();
    subscribe('front', late);

    expect(load).toHaveBeenCalledOnce();
    for (const listener of [first, second, late]) {
      expect(listener).toHaveBeenCalledExactlyOnceWith('face');
    }
  });

  test('different keys load separately', () => {
    const { requests, subscribe } = sharedLoader();
    subscribe('front', vi.fn());
    subscribe('back', vi.fn());

    expect(requests.map((request) => request.key)).toEqual(['front', 'back']);
  });

  test('the face is released only when its last subscriber leaves, and the next subscriber loads it again', () => {
    const { load, release, requests, subscribe } = sharedLoader();
    const leaveFirst = subscribe('front', vi.fn());
    const leaveSecond = subscribe('front', vi.fn());
    requests[0]!.succeed('face');

    leaveFirst();
    expect(release).not.toHaveBeenCalled();
    leaveSecond();
    expect(release).toHaveBeenCalledExactlyOnceWith('face');

    subscribe('front', vi.fn());
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('a shared load retries a failure for every subscriber', () => {
    const { load, requests, subscribe } = sharedLoader();
    const first = vi.fn();
    const second = vi.fn();
    subscribe('front', first);
    subscribe('front', second);

    requests[0]!.fail();
    vi.advanceTimersByTime(5000);
    requests[1]!.succeed('face');

    expect(load).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledExactlyOnceWith('face');
    expect(second).toHaveBeenCalledExactlyOnceWith('face');
  });

  test('leaving before the load finishes releases the face when it arrives', () => {
    const { release, requests, subscribe } = sharedLoader();
    const listener = vi.fn();
    subscribe('front', listener)();
    requests[0]!.succeed('face');

    expect(listener).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledExactlyOnceWith('face');
  });
});
