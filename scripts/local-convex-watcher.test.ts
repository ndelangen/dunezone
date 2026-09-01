import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  classifyLocalConvexChange,
  classifyLocalConvexRootChange,
  createLocalConvexPushCoordinator,
} from './local-convex-watcher';

afterEach(() => {
  vi.useRealTimers();
});

describe('local Convex watcher', () => {
  test('classifies backend changes without watching generated bindings', () => {
    for (const file of [
      'convex/schema.ts',
      'convex/factions.ts',
      'convex/_generatedExtra.ts',
      'convex',
      'src/shared',
      'src/shared/factions/schema.ts',
      'package.json',
      'tsconfig.json',
      'convex.json',
    ]) {
      expect(classifyLocalConvexChange(file), file).toBe('push');
    }
    for (const file of [
      'convex/migrations.ts',
      'convex/migrations.groupsSoftDelete.ts',
      'convex/migrationsTemplate.ts',
      'convex/migrations/backfillFactionSlugs.ts',
      'convex/migration-guards.json',
    ]) {
      expect(classifyLocalConvexChange(file), file).toBe('restart');
    }
    for (const file of [
      'convex/_generated',
      'convex/_generated/api.d.ts',
      'convex-other/schema.ts',
      'src/shared-other/schema.ts',
      'src/app/router.tsx',
      'docs/README.md',
    ]) {
      expect(classifyLocalConvexChange(file), file).toBe('ignore');
    }
    expect(classifyLocalConvexChange('convex\\_generated\\api.d.ts')).toBe('ignore');
  });

  test('limits root watcher events to configuration files', () => {
    for (const file of ['package.json', 'tsconfig.json', 'convex.json']) {
      expect(classifyLocalConvexRootChange(file), file).toBe('push');
    }
    for (const file of ['convex', 'src', 'bun.lock', 'README.md']) {
      expect(classifyLocalConvexRootChange(file), file).toBe('ignore');
    }
    expect(classifyLocalConvexRootChange(null)).toBe('restart');
  });

  test('debounces save bursts', async () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const coordinator = createLocalConvexPushCoordinator({ push });

    coordinator.record('push');
    await vi.advanceTimersByTimeAsync(100);
    coordinator.record('push');
    await vi.advanceTimersByTimeAsync(149);
    expect(push).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(push).toHaveBeenCalledOnce();
  });

  test('serializes pushes and keeps one follow-up for edits during a push', async () => {
    vi.useFakeTimers();
    let finishFirstPush: (() => void) | undefined;
    let runningPushes = 0;
    let highestConcurrentPushCount = 0;
    const push = vi.fn(async () => {
      runningPushes += 1;
      highestConcurrentPushCount = Math.max(highestConcurrentPushCount, runningPushes);
      if (push.mock.calls.length === 1) {
        await new Promise<void>((resolve) => {
          finishFirstPush = resolve;
        });
      }
      runningPushes -= 1;
    });
    const coordinator = createLocalConvexPushCoordinator({ push });

    coordinator.record('push');
    await vi.advanceTimersByTimeAsync(150);
    expect(push).toHaveBeenCalledOnce();
    coordinator.record('push');
    coordinator.record('push');
    expect(push).toHaveBeenCalledOnce();

    finishFirstPush?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(150);
    expect(push).toHaveBeenCalledTimes(2);
    expect(highestConcurrentPushCount).toBe(1);
  });

  test('requires a restart before a pending migration change can be pushed', async () => {
    vi.useFakeTimers();
    const push = vi.fn();
    const onRestartRequired = vi.fn();
    const coordinator = createLocalConvexPushCoordinator({ push, onRestartRequired });

    coordinator.record('push');
    coordinator.record('restart');
    coordinator.record('push');
    coordinator.record('restart');
    await vi.advanceTimersByTimeAsync(1000);

    expect(push).not.toHaveBeenCalled();
    expect(onRestartRequired).toHaveBeenCalledOnce();
  });

  test('waits for a correcting edit after a failed push', async () => {
    vi.useFakeTimers();
    const onPushFailed = vi.fn();
    const push = vi.fn().mockRejectedValueOnce(new Error('invalid function')).mockResolvedValueOnce(undefined);
    const coordinator = createLocalConvexPushCoordinator({ push, onPushFailed });

    coordinator.record('push');
    await vi.advanceTimersByTimeAsync(150);
    expect(push).toHaveBeenCalledOnce();
    expect(onPushFailed).toHaveBeenCalledOnce();

    coordinator.record('push');
    await vi.advanceTimersByTimeAsync(150);
    expect(push).toHaveBeenCalledTimes(2);
  });
});
