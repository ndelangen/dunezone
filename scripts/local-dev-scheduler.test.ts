import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test';

import { createPersistentManifest } from './local-dev-persistence';
import type * as Persistence from './local-dev-persistence';
import { startPersistentPublicationScheduler } from './local-dev-scheduler';

const guard = vi.hoisted(() => vi.fn());
vi.mock('./local-dev-persistence', async (original) => ({
  ...(await original<typeof Persistence>()),
  assertPersistentDiskBudget: guard,
}));

function heldRequests() {
  const requests: Array<{ signal: AbortSignal; complete(): void }> = [];
  const fetch = vi.fn(
    (_url: string, options: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = options.signal;
        if (!signal) {
          throw new Error('The scheduler must supply its Stop signal');
        }
        const aborted = () => reject(signal.reason);
        signal.addEventListener('abort', aborted, { once: true });
        requests.push({
          signal,
          complete() {
            signal.removeEventListener('abort', aborted);
            resolve(new Response('completed'));
          },
        });
      })
  );
  vi.stubGlobal('fetch', fetch);
  return { requests, fetch };
}

beforeEach(() => {
  vi.useFakeTimers();
  guard.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  // Node's native timeout signal has its own clock. Exercise that deadline on the fake clock too.
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), milliseconds);
    return controller.signal;
  });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const manifest = () => createPersistentManifest('/tmp/scheduler-fixture/.dunezone-runtime', 'source');

describe('persistent publication scheduling', () => {
  test('waits beyond 260 seconds for completion, then waits five seconds before the next cycle', async () => {
    const { requests, fetch } = heldRequests();
    const scheduler = startPersistentPublicationScheduler(manifest());
    try {
      await vi.advanceTimersByTimeAsync(5000);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(300_000);
      expect(requests[0].signal.aborted).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
      expect(guard).toHaveBeenCalledOnce();
      requests[0].complete();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(4999);
      expect(fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(guard).toHaveBeenCalledTimes(2);
    } finally {
      scheduler.stop();
      await vi.advanceTimersByTimeAsync(0);
    }
  });

  test('Stop clears an idle timer without dispatching another request', async () => {
    const { fetch } = heldRequests();
    const scheduler = startPersistentPublicationScheduler(manifest());
    scheduler.stop();
    await vi.advanceTimersByTimeAsync(500_000);
    expect(fetch).not.toHaveBeenCalled();
    expect(guard).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  test.each(['active', 'completed'] as const)(
    'Stop prevents another cycle when the current request is %s',
    async (phase) => {
      const { requests, fetch } = heldRequests();
      const scheduler = startPersistentPublicationScheduler(manifest());
      await vi.advanceTimersByTimeAsync(5000);
      if (phase === 'completed') {
        requests[0].complete();
        await vi.advanceTimersByTimeAsync(0);
      }
      scheduler.stop();
      expect(requests[0].signal.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(500_000);
      expect(fetch).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  test('a disk-budget failure terminates scheduling before dispatch and remains terminal', async () => {
    const { requests, fetch } = heldRequests();
    const scheduler = startPersistentPublicationScheduler(manifest());
    const failure = scheduler.failure.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(5000);
    requests[0].complete();
    await vi.advanceTimersByTimeAsync(0);
    const full = new Error('Persistent runtime exceeds its byte budget');
    guard.mockImplementationOnce(() => {
      throw full;
    });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await failure).toBe(full);
    await vi.advanceTimersByTimeAsync(500_000);
    expect(fetch).toHaveBeenCalledOnce();
    expect(guard).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    scheduler.stop();
  });
});
