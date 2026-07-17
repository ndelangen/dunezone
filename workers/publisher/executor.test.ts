import { describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/assetPublisherHttp';
import { type CapturedPdf, TargetRenderError } from './browser';
import type { ClaimedTarget } from './convex';
import { executeItemList } from './executor';
import type { AssetBucket } from './r2';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const cacheSecret = createCacheSigningSecret();

const item: ClaimedTarget = {
  targetId: 'target-one',
  factionId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
  assetType: 'faction_sheet',
  claimToken: 'claim-token-0000000000000001',
  generation: 2,
  rendererVersion: 'faction-sheet-v3',
  leaseExpiresAt: NOW + 240_000,
};

const config = {
  captureBaseUrl: 'https://publisher.example.com',
  convexExecutorBaseUrl: 'https://convex.example.com/asset-publishing/executor',
  convexRenderUrl: 'https://convex.example.com/asset-publishing/render',
  supportedRendererVersion: 'faction-sheet-v3',
  supportedRendererVersions: ['faction-sheet-v3'] as const,
  maxItems: 20,
  workWindowMs: 240_000,
  browserCaptureTimeoutMs: 45_000,
  browserCleanupGraceMs: 15_000,
  pdfMaxBytes: 8_000_000,
};

function capturedPdf(): CapturedPdf {
  return {
    bytes: new Uint8Array([1, 2, 3]),
    payloadHash: 'a'.repeat(64),
    pageCount: 2,
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    consoleErrors: [],
    requestFailures: [],
    pageErrors: [],
    httpErrors: [],
  };
}

describe('item-list executor', () => {
  test('closes the browser before awaiting deferred completions', async () => {
    let completeResolve: ((value: 'completed') => void) | undefined;
    let closeObservedResolve: (() => void) | undefined;
    const closeObserved = new Promise<void>((resolve) => {
      closeObservedResolve = resolve;
    });
    const close = vi.fn(async () => {
      closeObservedResolve?.();
    });
    const bucket: AssetBucket = {
      head: async () => null,
      put: async () =>
        ({
          etag: 'etag-one',
        }) as R2Object,
    };
    const execution = executeItemList(config, [item], {
      bucket,
      cacheTokenSecret: cacheSecret,
      client: {
        revalidate: async () => ({
          status: 'valid' as const,
          factionId: item.factionId,
          assetType: item.assetType,
          leaseExpiresAt: item.leaseExpiresAt,
        }),
        complete: async () =>
          await new Promise<'completed'>((resolve) => {
            completeResolve = resolve;
          }),
        fail: async () => 'failed' as const,
      },
      openBrowser: async () => ({
        capture: async () => capturedPdf(),
        close,
        sessionId: () => 'browser-session-one',
      }),
      now: () => NOW,
      signCacheToken: async () => `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
    });

    await closeObserved;
    expect(close).toHaveBeenCalledOnce();

    completeResolve?.('completed');
    await expect(execution).resolves.toMatchObject({
      assigned: 1,
      rendered: 1,
      completed: 1,
      targetFailed: 0,
      stale: 0,
      unprocessed: 0,
      browserOpened: true,
      browserClosed: true,
    });
  });

  test('records a target render failure and continues without surfacing a systemic error', async () => {
    const bucket: AssetBucket = {
      head: async () => null,
      put: async () => {
        throw new Error('put should not run');
      },
    };
    const fail = vi.fn(async () => 'failed' as const);

    await expect(
      executeItemList(config, [item], {
        bucket,
        cacheTokenSecret: cacheSecret,
        client: {
          revalidate: async () => ({
            status: 'valid' as const,
            factionId: item.factionId,
            assetType: item.assetType,
            leaseExpiresAt: item.leaseExpiresAt,
          }),
          complete: async () => 'completed' as const,
          fail,
        },
        openBrowser: async () => ({
          capture: async () => {
            throw new TargetRenderError('Captured PDF must contain exactly two pages');
          },
          close: async () => undefined,
          sessionId: () => 'browser-session-two',
        }),
        now: () => NOW,
        signCacheToken: async () => `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
      })
    ).resolves.toMatchObject({
      assigned: 1,
      rendered: 0,
      completed: 0,
      targetFailed: 1,
      stale: 0,
      unprocessed: 0,
      browserOpened: true,
      browserClosed: true,
    });
    expect(fail).toHaveBeenCalledOnce();
  });

  test('never opens a browser for an invalid list larger than twenty items', async () => {
    const openBrowser = vi.fn();
    await expect(
      executeItemList(
        config,
        Array.from({ length: 21 }, () => item),
        {
          bucket: {} as AssetBucket,
          cacheTokenSecret: cacheSecret,
          client: {} as never,
          openBrowser,
        }
      )
    ).rejects.toThrow(/between 1 and 20/);
    expect(openBrowser).not.toHaveBeenCalled();
  });

  test('stops starting items when the four-minute work window is exhausted', async () => {
    let currentTime = NOW;
    const capture = vi.fn(async () => {
      return capturedPdf();
    });
    const complete = vi.fn(async () => {
      currentTime = NOW + config.workWindowMs;
      return 'completed' as const;
    });
    const second = { ...item, targetId: 'target-two', claimToken: 'claim-token-0000000000000002' };

    await expect(
      executeItemList(config, [item, second], {
        bucket: {
          head: async () => null,
          put: async () => ({ etag: 'etag-one' }) as R2Object,
        },
        cacheTokenSecret: cacheSecret,
        client: {
          revalidate: async () => ({
            status: 'valid' as const,
            factionId: item.factionId,
            assetType: item.assetType,
            leaseExpiresAt: item.leaseExpiresAt,
          }),
          complete,
          fail: async () => 'failed' as const,
        },
        openBrowser: async () => ({
          capture,
          close: async () => undefined,
          sessionId: () => 'browser-session-window',
        }),
        now: () => currentTime,
        signCacheToken: async () => `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
      })
    ).resolves.toMatchObject({
      assigned: 2,
      rendered: 1,
      completed: 1,
      unprocessed: 1,
      browserClosed: true,
    });
    expect(capture).toHaveBeenCalledOnce();
  });

  test('leaves infrastructure failures leased and still closes the browser', async () => {
    const fail = vi.fn();
    const close = vi.fn(async () => undefined);
    await expect(
      executeItemList(config, [item], {
        bucket: {} as AssetBucket,
        cacheTokenSecret: cacheSecret,
        client: {
          revalidate: vi.fn(),
          complete: vi.fn(),
          fail,
        },
        openBrowser: async () => ({
          capture: async () => {
            throw new Error('Browser service unavailable');
          },
          close,
          sessionId: () => 'browser-session-infrastructure',
        }),
        now: () => NOW,
      })
    ).rejects.toThrow(/Item-list publisher execution failed/);
    expect(fail).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  test('retries a failed completion only after browser close', async () => {
    let browserClosed = false;
    const complete = vi
      .fn<() => Promise<'completed'>>()
      .mockRejectedValueOnce(new Error('temporary Convex failure'))
      .mockImplementationOnce(async () => {
        expect(browserClosed).toBe(true);
        return 'completed';
      });
    await expect(
      executeItemList(config, [item], {
        bucket: {
          head: async () => null,
          put: async () => ({ etag: 'etag-one' }) as R2Object,
        },
        cacheTokenSecret: cacheSecret,
        client: {
          revalidate: async () => ({
            status: 'valid' as const,
            factionId: item.factionId,
            assetType: item.assetType,
            leaseExpiresAt: item.leaseExpiresAt,
          }),
          complete,
          fail: async () => 'failed' as const,
        },
        openBrowser: async () => ({
          capture: async () => capturedPdf(),
          close: async () => {
            browserClosed = true;
          },
          sessionId: () => 'browser-session-retry',
        }),
        now: () => NOW,
        signCacheToken: async () => `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`,
      })
    ).resolves.toMatchObject({ completed: 1, browserClosed: true });
    expect(complete).toHaveBeenCalledTimes(2);
  });
});
