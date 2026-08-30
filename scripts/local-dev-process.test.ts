import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { CleanupFenceHeldError, CleanupProcessGroup } from './local-dev-process';

const processGroupId = 424_242;

function processError(code: string) {
  return Object.assign(new Error(`Process signal failed with ${code}`), { code });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('local cleanup process groups', () => {
  test('accepts a group that has already exited without sending a signal', async () => {
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw processError('ESRCH');
    });

    await expect(new CleanupProcessGroup(processGroupId).terminate()).resolves.toBeUndefined();
    expect(kill).toHaveBeenCalledExactlyOnceWith(-processGroupId, 0);
  });

  test.each(['SIGTERM', 'SIGKILL'] as const)(
    'accepts a group that exits before %s reaches it',
    async (disappearingSignal) => {
      vi.spyOn(process, 'kill').mockImplementation((target, signal) => {
        expect(target).toBe(-processGroupId);
        if (signal === disappearingSignal) {
          throw processError('ESRCH');
        }
        return true;
      });

      const completion = expect(new CleanupProcessGroup(processGroupId).terminate()).resolves.toBeUndefined();
      await Promise.all([completion, vi.runAllTimersAsync()]);
    }
  );

  test.each(['EPERM', 'EINVAL'])('preserves signal failures other than a missing group: %s', async (code) => {
    const failure = processError(code);
    vi.spyOn(process, 'kill').mockImplementation((_target, signal) => {
      if (signal !== 0) {
        throw failure;
      }
      return true;
    });

    await expect(new CleanupProcessGroup(processGroupId).terminate()).rejects.toBe(failure);
  });

  test('waits for the group to drain after sending SIGKILL', async () => {
    let live = true;
    const kill = vi.spyOn(process, 'kill').mockImplementation((_target, signal) => {
      if (signal === 0 && !live) {
        throw processError('ESRCH');
      }
      return true;
    });
    let drained = false;
    const completion = new CleanupProcessGroup(processGroupId).terminate().then(() => {
      drained = true;
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(kill).toHaveBeenCalledWith(-processGroupId, 'SIGKILL');
    expect(drained).toBe(false);

    live = false;
    await Promise.all([completion, vi.runAllTimersAsync()]);
    expect(drained).toBe(true);
  });

  test('holds the cleanup fence when the group survives both signals', async () => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true);
    const completion = expect(new CleanupProcessGroup(processGroupId).terminate()).rejects.toBeInstanceOf(
      CleanupFenceHeldError
    );

    await Promise.all([completion, vi.runAllTimersAsync()]);
    expect(kill).toHaveBeenCalledWith(-processGroupId, 'SIGTERM');
    expect(kill).toHaveBeenCalledWith(-processGroupId, 'SIGKILL');
  });
});
