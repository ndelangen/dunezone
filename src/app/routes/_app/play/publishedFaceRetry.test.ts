import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { loadPublishedFace } from './publishedFaceRetry';

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
