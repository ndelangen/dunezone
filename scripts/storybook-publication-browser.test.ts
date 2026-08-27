import { describe, expect, test, vi } from 'vitest';

import { RETRYABLE_BROWSER_CHECK_STATUS, runBrowserCheck } from './storybook-publication-browser';
import type { BrowserCheckProcess } from './storybook-publication-browser';

function processThatExits(status: number): BrowserCheckProcess {
  return {
    exited: Promise.resolve(status),
    kill: vi.fn(),
  };
}

function processThatStopsOn(signal?: NodeJS.Signals): BrowserCheckProcess {
  let resolveExit: (status: number) => void = () => undefined;
  return {
    exited: new Promise((resolve) => {
      resolveExit = resolve;
    }),
    kill: vi.fn((receivedSignal) => {
      if (receivedSignal === signal) {
        resolveExit(signal === 'SIGKILL' ? 137 : 143);
      }
    }),
  };
}

function check(spawn: () => BrowserCheckProcess, timeoutMs = 10) {
  return runBrowserCheck({ spawn, timeoutMs, shutdownTimeoutMs: 1 });
}

describe('Storybook publication browser process', () => {
  test('kills a timed-out browser check and retries it once', async () => {
    const timedOut = processThatStopsOn();
    const passed = processThatExits(0);
    const spawn = vi.fn().mockReturnValueOnce(timedOut).mockReturnValueOnce(passed);

    await expect(check(spawn, 1)).resolves.toBeUndefined();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(timedOut.kill).toHaveBeenCalledOnce();
  });

  test('retries a navigation timeout reported by the browser child', async () => {
    const spawn = vi
      .fn()
      .mockReturnValueOnce(processThatExits(RETRYABLE_BROWSER_CHECK_STATUS))
      .mockReturnValueOnce(processThatExits(0));

    await expect(check(spawn)).resolves.toBeUndefined();
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test('uses SIGKILL when the browser child ignores normal termination', async () => {
    const timedOut = processThatStopsOn('SIGKILL');
    const spawn = vi.fn().mockReturnValueOnce(timedOut).mockReturnValueOnce(processThatExits(0));

    await expect(check(spawn, 1)).resolves.toBeUndefined();
    expect(timedOut.kill).toHaveBeenNthCalledWith(1);
    expect(timedOut.kill).toHaveBeenNthCalledWith(2, 'SIGKILL');
  });

  test('fails after two browser children time out', async () => {
    const spawn = vi.fn().mockReturnValueOnce(processThatStopsOn()).mockReturnValueOnce(processThatStopsOn());

    await expect(check(spawn, 1)).rejects.toThrow('Browser publication check exceeded 1ms on 2 attempts.');
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  test('does not retry a publication assertion failure', async () => {
    const spawn = vi.fn().mockReturnValue(processThatExits(1));

    await expect(check(spawn)).rejects.toThrow('Browser publication check exited with status 1.');
    expect(spawn).toHaveBeenCalledOnce();
  });
});
