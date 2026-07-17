import { describe, expect, test, vi } from 'vitest';

import type { PublisherConfig } from './config';
import {
  type AcquireResult,
  type ClaimedTarget,
  ConvexPublisherClient,
  type ExactClaim,
} from './convex';
import { executeOwnedBatch, type FailurePoint, type OwnedBatchDependencies } from './executor';
import { postJson } from './http';
import type { AssetBucket } from './r2';
import { rendererManifest } from './renderer-manifest.generated';
import { fakeR2Object } from './test-helpers';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const config: PublisherConfig = {
  captureBaseUrl: 'https://publisher.example.com',
  convexPollUrl: 'https://convex.example.com/poll',
  convexExecutorBaseUrl: 'https://convex.example.com/executor',
  convexRenderUrl: 'https://convex.example.com/render',
  supportedRendererVersion: rendererManifest.rendererVersion,
  supportedRendererVersions: rendererManifest.supportedRendererVersions,
  maxItems: 1,
  softDeadlineMs: 240_000,
  uploadMarginMs: 120_000,
  browserCaptureTimeoutMs: 45_000,
  browserCleanupGraceMs: 5,
  pdfMaxBytes: 8_000_000,
  queueMaxPreOwnershipAttempts: 2,
  queueRetryDelaySeconds: 60,
};
const acquisition: Extract<AcquireResult, { status: 'acquired' }> = {
  status: 'acquired',
  replay: false,
  batchToken: 'batch-token-0000000000000001',
  leaseExpiresAt: NOW + 720_000,
  browserReservationMs: 240_000,
  dailyBrowserMs: 240_000,
};
const claim: ClaimedTarget = {
  status: 'claimed',
  replay: false,
  targetId: 'target',
  factionId: 'faction',
  assetType: 'faction_sheet',
  batchToken: acquisition.batchToken,
  claimToken: 'claim-token-0000000000000001',
  generation: 1,
  rendererVersion: rendererManifest.rendererVersion,
  leaseExpiresAt: acquisition.leaseExpiresAt,
  payloadHash: 'a'.repeat(64),
  renderCapability: 'render-capability-token-000000001',
  renderCapabilityExpiresAt: NOW + 300_000,
};

function r2Object(): R2Object {
  return fakeR2Object({ etag: 'etag-one', size: 3, customMetadata: {}, uploaded: new Date(NOW) });
}

function setup(
  options: {
    claimResult?: typeof claim | { status: 'empty' | 'stale' | 'conflict' };
    revalidateStatus?: 'valid' | 'stale' | 'insufficient_lease' | 'storage_guard' | 'storage_limit';
    browserAvailable?: boolean;
    close?: () => Promise<void>;
    complete?: () => Promise<'completed' | 'stale'>;
    put?: AssetBucket['put'];
    pdfBytes?: number;
    pdfPageCount?: number;
    pdfWidthMm?: number;
    pdfHeightMm?: number;
    captureError?: Error;
    claim?: (
      batchToken: string,
      deadlineAt?: number
    ) => Promise<typeof claim | { status: 'empty' | 'stale' | 'conflict' }>;
    now?: () => number;
    fault?: FailurePoint;
  } = {}
) {
  const fail = vi.fn(async (_claim: ExactClaim, _error: string) => 'failed' as const);
  const release = vi.fn(async (_claim: ExactClaim) => 'released' as const);
  const settleBrowser = vi.fn(async () => 'settled' as const);
  const releaseBatch = vi.fn(async () => 'released' as const);
  const complete = vi.fn(options.complete ?? (async () => 'completed' as const));
  const revalidate = vi.fn(async () => {
    if (options.revalidateStatus === 'stale') return { status: 'stale' as const };
    if (options.revalidateStatus === 'insufficient_lease') {
      return { status: 'insufficient_lease' as const, leaseExpiresAt: NOW + 1 };
    }
    if (
      options.revalidateStatus === 'storage_guard' ||
      options.revalidateStatus === 'storage_limit'
    ) {
      return { status: options.revalidateStatus };
    }
    return {
      status: 'valid' as const,
      leaseExpiresAt: claim.leaseExpiresAt,
      factionId: claim.factionId,
      assetType: claim.assetType,
      payloadHash: claim.payloadHash,
    };
  });
  const put = vi.fn(options.put ?? (async () => r2Object()));
  const bucket: AssetBucket = { head: async () => null, put };
  const capturedBytes = new Uint8Array(options.pdfBytes ?? 3);
  const capture = vi.fn(async () => {
    if (options.captureError) throw options.captureError;
    return {
      bytes: capturedBytes,
      pageCount: options.pdfPageCount ?? 2,
      pageWidthMm: options.pdfWidthMm ?? 210,
      pageHeightMm: options.pdfHeightMm ?? 297,
      consoleErrors: [],
      requestFailures: [],
      pageErrors: [],
      httpErrors: [],
    };
  });
  const close = vi.fn(options.close ?? (async () => undefined));
  const openBrowser = vi.fn(async () => ({ capture, close }));
  const dependencies: OwnedBatchDependencies = {
    client: {
      claim: options.claim ?? (async () => options.claimResult ?? claim),
      settleBrowser,
      releaseBatch,
      revalidate,
      complete,
      fail,
      release,
    },
    bucket,
    browserAvailable: async () => options.browserAvailable ?? true,
    openBrowser,
    now: options.now ?? (() => NOW),
    ...(options.fault
      ? {
          fault(point) {
            if (point === options.fault) throw new Error(`Injected ${point}`);
          },
        }
      : {}),
  };
  return {
    dependencies,
    spies: {
      fail,
      release,
      settleBrowser,
      releaseBatch,
      complete,
      revalidate,
      put,
      capture,
      capturedBytes,
      close,
      openBrowser,
    },
  };
}

describe('one-item owned batch execution', () => {
  test('renders, closes, settles, revalidates, conditionally uploads, and completes', async () => {
    const { dependencies, spies } = setup();
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'completed',
      browserOpened: true,
      browserClosed: true,
      browserSettled: true,
      uploaded: true,
      completed: true,
    });
    expect(spies.revalidate).toHaveBeenCalledBefore(spies.put);
    expect(spies.put).toHaveBeenCalledBefore(spies.complete);
    expect(spies.complete).toHaveBeenCalledBefore(spies.settleBrowser);
    expect(report.telemetry).toMatchObject({
      configuredMaxItems: 1,
      effectiveMaxItems: 1,
      platform: {
        cpuMs: null,
        wallMs: null,
        memoryBytes: null,
        subrequests: null,
        source: 'cloudflare_analytics_required',
      },
      logicalCalls: {
        convex: { claim: 1, revalidate: 1, complete: 1, settleBrowser: 1 },
        r2: { head: 1, put: 1 },
        cache: { match: 0, put: 0 },
      },
      minimumLeaseMarginMs: 720_000,
      item: {
        outcome: 'completed',
        pdf: { bytes: 3, pages: 2, widthMm: 210, heightMm: 297 },
      },
    });
  });

  test('one retained Browser session executes two v3 items', async () => {
    const secondClaim: ClaimedTarget = {
      ...claim,
      targetId: 'second-v3-target',
      factionId: 'second-v3-faction',
      claimToken: 'claim-token-0000000000000002',
      payloadHash: 'b'.repeat(64),
      renderCapability: 'render-capability-token-000000002',
    };
    const claimed = [claim, secondClaim];
    const claimNext = vi.fn(async () => claimed.shift() ?? ({ status: 'empty' } as const));
    const { dependencies, spies } = setup({ claim: claimNext });
    dependencies.client.revalidate = vi.fn(async (exactClaim) => {
      const owned = exactClaim.targetId === secondClaim.targetId ? secondClaim : claim;
      return {
        status: 'valid' as const,
        leaseExpiresAt: owned.leaseExpiresAt,
        factionId: owned.factionId,
        assetType: owned.assetType,
        payloadHash: owned.payloadHash,
      };
    });

    const report = await executeOwnedBatch(
      dependencies,
      { ...config, maxItems: 2 },
      acquisition,
      NOW
    );

    expect(report).toMatchObject({
      status: 'completed',
      browserOpened: true,
      browserClosed: true,
      browserSettled: true,
      telemetry: {
        configuredMaxItems: 2,
        effectiveMaxItems: 2,
        counts: { claimed: 2, completed: 2, failed: 0 },
        items: [
          { rendererMismatch: false, outcome: 'completed' },
          { rendererMismatch: false, outcome: 'completed' },
        ],
      },
    });
    expect(spies.openBrowser).toHaveBeenCalledOnce();
    expect(spies.capture).toHaveBeenCalledTimes(2);
    expect(spies.put).toHaveBeenCalledTimes(2);
    expect(spies.complete).toHaveBeenCalledTimes(2);
    expect(spies.settleBrowser).toHaveBeenCalledOnce();
    expect(spies.releaseBatch).toHaveBeenCalledOnce();
  });

  test('a rollout checkpoint releases the retained batch only after Browser settlement', async () => {
    const rolloutClaim = { ...claim, workLane: 'rollout' as const };
    const { dependencies, spies } = setup({ claimResult: rolloutClaim });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'completed',
      browserSettled: true,
      telemetry: { queue: { lane: 'rollout' } },
    });
    expect(spies.complete).toHaveBeenCalledBefore(spies.settleBrowser);
    expect(spies.settleBrowser).toHaveBeenCalledBefore(spies.releaseBatch);
    expect(spies.releaseBatch).toHaveBeenCalledWith(
      acquisition.batchToken,
      'after_settlement',
      expect.any(Number)
    );
  });

  test('empty and duplicate/busy-fenced claims close without upload', async () => {
    for (const status of ['empty', 'stale', 'conflict'] as const) {
      const { dependencies, spies } = setup({ claimResult: { status } });
      const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
      expect(report.browserClosed, status).toBe(true);
      expect(report.browserSettled, status).toBe(true);
      expect(spies.releaseBatch, status).toHaveBeenCalledWith(
        acquisition.batchToken,
        'after_settlement',
        expect.any(Number)
      );
      expect(spies.put, status).not.toHaveBeenCalled();
    }
  });

  test('Browser unavailability refunds the untouched reservation and opens no browser', async () => {
    const { dependencies, spies } = setup({ browserAvailable: false });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({ status: 'systemic_stop', browserOpened: false });
    expect(report.telemetry).toMatchObject({
      counts: { claimed: 0, completed: 0, stale: 0, failed: 0 },
      invocationFailureClass: 'browser_unavailable',
      browser: { outcome: 'not_opened' },
      item: null,
    });
    expect(spies.releaseBatch).toHaveBeenCalledWith(
      acquisition.batchToken,
      'no_browser',
      expect.any(Number)
    );
    expect(spies.openBrowser).not.toHaveBeenCalled();
  });

  test.each([
    ['closed', async (): Promise<void> => undefined, 'late_opened_closed'],
    [
      'close failure',
      async (): Promise<void> => await Promise.reject(new Error('close failed')),
      'late_opened_close_failed',
    ],
    [
      'close timeout',
      async (): Promise<void> => await new Promise<void>(() => {}),
      'late_opened_close_timeout',
    ],
  ] as const)('records a late-opened Browser session with %s', async (_label, close, outcome) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const { dependencies } = setup({ now: Date.now });
      dependencies.openBrowser = async () => {
        await new Promise((resolve) => setTimeout(resolve, 110));
        return {
          sessionId: () => 'late-browser-session-sensitive',
          capture: async () => {
            throw new Error('late session must never capture');
          },
          close,
        };
      };
      const execution = executeOwnedBatch(
        dependencies,
        {
          ...config,
          softDeadlineMs: 6_000,
          browserCaptureTimeoutMs: 100,
          browserCleanupGraceMs: 100,
        },
        acquisition,
        NOW
      );
      await vi.advanceTimersByTimeAsync(outcome === 'late_opened_close_timeout' ? 6_000 : 200);
      const report = await execution;
      expect(report).toMatchObject({
        status: 'systemic_stop',
        browserOpened: true,
        telemetry: {
          counts: { claimed: 0, completed: 0, stale: 0, failed: 0 },
          browser: {
            outcome,
            sessionCorrelationHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          },
          item: null,
        },
      });
      expect(report.telemetry.browser.closeAttemptMs).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(report)).not.toContain('late-browser-session-sensitive');
    } finally {
      vi.useRealTimers();
    }
  });

  test('a launch resolving beyond the former late grace is closed exactly once without phase overlap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const { dependencies } = setup({ now: Date.now });
      const close = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 31));
      });
      dependencies.openBrowser = async () => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return {
          sessionId: () => 'beyond-former-grace-session',
          capture: async () => {
            throw new Error('late session must never capture');
          },
          close,
        };
      };
      const execution = executeOwnedBatch(
        dependencies,
        {
          ...config,
          softDeadlineMs: 6_000,
          browserCaptureTimeoutMs: 100,
          browserCleanupGraceMs: 100,
        },
        acquisition,
        NOW
      );
      await vi.advanceTimersByTimeAsync(281);
      const report = await execution;
      expect(close).toHaveBeenCalledOnce();
      expect(report.telemetry).toMatchObject({
        phasesMs: { browserLaunch: 100, lateBrowserWait: 150, lateBrowserClose: 31 },
        browser: { outcome: 'late_opened_closed', openToCloseMs: 31, closeAttemptMs: 31 },
        counts: { claimed: 0, failed: 0 },
        item: null,
      });
      expect(report.telemetry.phasesMs.browserLaunch).not.toBe(281);
    } finally {
      vi.useRealTimers();
    }
  });

  test('an unresolved late launch is observably fenced and retains one attached close continuation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const { dependencies } = setup({ now: Date.now });
      const close = vi.fn(async () => undefined);
      let resolveBrowser:
        | ((browser: Awaited<ReturnType<typeof dependencies.openBrowser>>) => void)
        | undefined;
      dependencies.openBrowser = async () =>
        await new Promise((resolve) => {
          resolveBrowser = resolve;
        });
      const execution = executeOwnedBatch(
        dependencies,
        {
          ...config,
          softDeadlineMs: 6_000,
          browserCaptureTimeoutMs: 100,
          browserCleanupGraceMs: 100,
        },
        acquisition,
        NOW
      );
      await vi.advanceTimersByTimeAsync(1_000);
      const report = await execution;
      expect(report).toMatchObject({
        status: 'systemic_stop',
        browserOpened: false,
        browserClosed: false,
        browserSettled: false,
        telemetry: {
          phasesMs: { browserLaunch: 100, lateBrowserWait: 900 },
          browser: { outcome: 'late_launch_unresolved_fenced' },
          counts: { claimed: 0, failed: 0 },
          item: null,
        },
      });
      resolveBrowser?.({
        sessionId: () => 'post-fence-late-session',
        capture: async () => {
          throw new Error('late session must never capture');
        },
        close,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test('an invalid reservation remains a systemic stop without changing batch ownership', async () => {
    const { dependencies, spies } = setup();
    const report = await executeOwnedBatch(
      dependencies,
      { ...config, browserCleanupGraceMs: 5_000 },
      { ...acquisition, browserReservationMs: 10_000 },
      NOW
    );
    expect(report).toMatchObject({ status: 'systemic_stop', browserOpened: false });
    expect(spies.releaseBatch).not.toHaveBeenCalled();
    expect(spies.openBrowser).not.toHaveBeenCalled();
  });

  test('a launch failure keeps the conservative reservation and opens no replacement', async () => {
    const { dependencies, spies } = setup();
    dependencies.openBrowser = async () => await Promise.reject(new Error('launch failed'));
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('systemic_stop');
    expect(spies.releaseBatch).not.toHaveBeenCalled();
    expect(spies.settleBrowser).not.toHaveBeenCalled();
  });

  test('cleanup timeout leaves Browser usage conservatively unsettled', async () => {
    const { dependencies, spies } = setup({ close: async () => await new Promise(() => {}) });
    const report = await executeOwnedBatch(
      dependencies,
      { ...config, browserCleanupGraceMs: 1 },
      acquisition,
      NOW
    );
    expect(report).toMatchObject({ status: 'systemic_stop', browserClosed: false });
    expect(spies.settleBrowser).not.toHaveBeenCalled();
  });

  test('a post-completion close failure remains an invocation cleanup failure, not an item failure', async () => {
    const { dependencies } = setup({
      close: async () => await Promise.reject(new Error('provider close failed')),
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({ status: 'systemic_stop', completed: true });
    expect(report.telemetry).toMatchObject({
      counts: { claimed: 1, completed: 1, stale: 0, failed: 0 },
      invocationFailureClass: 'cleanup_failure',
      browser: { outcome: 'close_failed' },
      item: { outcome: 'completed' },
    });
  });

  test('a save observed during capture is rejected before R2', async () => {
    const { dependencies, spies } = setup({ revalidateStatus: 'stale' });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('stale');
    expect(spies.release).toHaveBeenCalled();
    expect(spies.put).not.toHaveBeenCalled();
  });

  test.each([
    'storage_guard',
    'storage_limit',
  ] as const)('a %s admission rejection releases the exact claim before R2', async (revalidateStatus) => {
    const { dependencies, spies } = setup({ revalidateStatus });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('stale');
    expect(spies.release).toHaveBeenCalledOnce();
    expect(spies.put).not.toHaveBeenCalled();
  });

  test('R2 failure and completion failure checkpoint a recoverable exact failure', async () => {
    const r2 = setup({ put: async () => await Promise.reject(new Error('R2 unavailable')) });
    expect((await executeOwnedBatch(r2.dependencies, config, acquisition, NOW)).status).toBe(
      'failed'
    );
    expect(r2.spies.fail).toHaveBeenCalled();

    const completion = setup({ complete: async () => await Promise.reject(new Error('lost')) });
    const report = await executeOwnedBatch(completion.dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({ status: 'failed', uploaded: true, completed: false });
    expect(completion.spies.fail).toHaveBeenCalled();
  });

  test('lease telemetry samples post-write, post-completion, and cleanup margins', async () => {
    let current = NOW;
    const { dependencies } = setup({
      now: () => current,
      put: async () => {
        current += 80_000;
        return r2Object();
      },
      complete: async () => {
        current += 40_000;
        return 'completed';
      },
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('completed');
    expect(report.telemetry).toMatchObject({
      minimumLeaseMarginMs: 600_000,
      leaseMarginsMs: {
        claim: 720_000,
        lastPreUpload: 720_000,
        postR2: 640_000,
        postCompletion: 600_000,
        cleanupStart: 600_000,
      },
    });
  });

  test('claims outside the exact embedded semantic support set fail before capture or R2', async () => {
    const rejectedRenderer = `Bearer SECRET_RENDERER_TOKEN ${'x'.repeat(100_000)}`;
    const { dependencies, spies } = setup({
      claimResult: { ...claim, rendererVersion: rejectedRenderer },
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'systemic_stop',
      telemetry: {
        counts: { claimed: 1, completed: 0, stale: 0, failed: 1 },
        invocationFailureClass: 'renderer',
        item: {
          rendererId: rendererManifest.rendererId,
          rendererMismatch: true,
          failureClass: 'renderer',
        },
      },
    });
    expect(JSON.stringify(report)).not.toContain('SECRET_RENDERER_TOKEN');
    expect(JSON.stringify(report)).not.toContain('rendererVersion');
    expect(spies.capture).not.toHaveBeenCalled();
    expect(spies.release).toHaveBeenCalledOnce();
  });

  test.each([
    'faction-sheet-v1',
    'faction-sheet-v2',
  ])('a legacy %s claim fails before Browser capture and R2', async (rendererVersion) => {
    const { dependencies, spies } = setup({
      claimResult: { ...claim, rendererVersion },
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'systemic_stop',
      telemetry: {
        invocationFailureClass: 'renderer',
        item: { rendererMismatch: true, failureClass: 'renderer' },
      },
    });
    expect(spies.capture).not.toHaveBeenCalled();
    expect(spies.put).not.toHaveBeenCalled();
    expect(spies.release).toHaveBeenCalledOnce();
  });

  test('accepts the observed 3,698,605-byte PDF and writes it conditionally to R2', async () => {
    const { dependencies, spies } = setup({ pdfBytes: 3_698_605 });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('completed');
    expect(spies.put).toHaveBeenCalledOnce();
    expect(spies.put.mock.calls[0]?.[1]).toBe(spies.capturedBytes);
    expect(spies.capturedBytes).toHaveLength(3_698_605);
    const onlyIf = spies.put.mock.calls[0]?.[2].onlyIf;
    expect(onlyIf).toBeInstanceOf(Headers);
    expect((onlyIf as Headers).get('If-None-Match')).toBe('*');
  });

  test('rejects an 8,000,001-byte PDF before R2 and checkpoints the failure', async () => {
    const { dependencies, spies } = setup({ pdfBytes: 8_000_001 });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('failed');
    expect(spies.put).not.toHaveBeenCalled();
    expect(spies.fail).toHaveBeenCalled();
  });

  test.each([
    ['wrong page count', { pdfPageCount: 1 }],
    ['wrong page width', { pdfWidthMm: 149 }],
    ['wrong page height', { pdfHeightMm: 196 }],
  ] as const)('%s is rejected before any R2 write', async (_label, inspection) => {
    const { dependencies, spies } = setup(inspection);
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('failed');
    expect(spies.put).not.toHaveBeenCalled();
    expect(spies.fail).toHaveBeenCalled();
  });

  test.each([
    'page error',
    'request failure',
    'HTTP 404',
  ])('capture diagnostic %s fails before R2', async (diagnostic) => {
    const { dependencies, spies } = setup({
      captureError: new Error(`Capture diagnostics rejected: ${diagnostic}`),
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report.status).toBe('failed');
    expect(spies.put).not.toHaveBeenCalled();
    expect(spies.fail).toHaveBeenCalled();
  });

  test('returned reports retain only a bounded failure class for secret-bearing errors', async () => {
    const signedUrl =
      'https://signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/art.png?token=SECRET_QUERY#SECRET_FRAGMENT';
    const { dependencies } = setup({ captureError: new Error(`Capture failed: ${signedUrl}`) });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    const serialized = JSON.stringify(report);
    expect(report).toMatchObject({
      error: 'asset publisher operational failure',
      telemetry: { invocationFailureClass: 'operational_failure' },
    });
    expect(serialized).not.toContain('cdn.example.com');
    for (const secret of [
      'signed-user',
      'SECRET_PASSWORD',
      'SECRET_PATH',
      'SECRET_QUERY',
      'SECRET_FRAGMENT',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  test('Browser, R2, and Convex failures cannot echo tokens or oversized diagnostics', async () => {
    const sentinels = [
      acquisition.batchToken,
      claim.claimToken,
      claim.renderCapability,
      'browser-session-sensitive-0001',
      'Bearer SECRET_BEARER_TOKEN',
      'POLL_SECRET_SENTINEL',
      'EXECUTOR_SECRET_SENTINEL',
      'PAYLOAD_SECRET_SENTINEL',
    ];
    const adversarial = `${sentinels.join(' ')} ${'x'.repeat(100_000)}`;
    const scenarios = [
      setup({ captureError: new Error(adversarial) }),
      setup({ put: async () => await Promise.reject(new Error(adversarial)) }),
      setup({ complete: async () => await Promise.reject(new Error(adversarial)) }),
    ];
    for (const { dependencies, spies } of scenarios) {
      const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
      const serialized = JSON.stringify(report);
      expect(report.error).toBe('asset publisher operational failure');
      expect(spies.fail).toHaveBeenCalledWith(
        expect.any(Object),
        'asset publisher operational failure',
        expect.any(Number),
        true
      );
      for (const sentinel of sentinels) expect(serialized).not.toContain(sentinel);
      expect(serialized).not.toContain('x'.repeat(1_000));
    }
  });

  test('a lost claim response is replayed and the recovered exact claim is failed', async () => {
    let calls = 0;
    const recovered = { ...claim, replay: true };
    const { dependencies, spies } = setup({
      claim: async () => {
        calls += 1;
        if (calls === 1) throw new Error('response lost after commit');
        return recovered;
      },
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({ status: 'failed', browserClosed: true, browserSettled: true });
    expect(spies.fail).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: claim.targetId, claimToken: claim.claimToken }),
      'asset publisher operational failure',
      expect.any(Number),
      true
    );
    expect(spies.releaseBatch).toHaveBeenCalledOnce();
    expect(spies.put).not.toHaveBeenCalled();
  });

  test('an unprovable claim outcome settles closed-browser usage but retains the claim fence', async () => {
    const { dependencies, spies } = setup({
      claim: async () => await Promise.reject(new Error('response unavailable')),
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'systemic_stop',
      browserClosed: true,
      browserSettled: true,
    });
    expect(spies.fail).not.toHaveBeenCalled();
    expect(spies.settleBrowser).toHaveBeenCalledOnce();
    expect(spies.releaseBatch).not.toHaveBeenCalled();
  });

  test('real client and HTTP settle a measurable post-lifecycle overrun at actual usage', async () => {
    let current = NOW;
    let settlementBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      settlementBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ ok: true, status: 'settled' });
    };
    const client = new ConvexPublisherClient({
      pollUrl: 'https://convex.example.com/poll',
      executorBaseUrl: 'https://convex.example.com/executor',
      pollToken: 'poll-token',
      executorToken: 'executor-token',
      fetcher,
      now: () => current,
    });
    const { dependencies, spies } = setup({ now: () => current });
    dependencies.client.settleBrowser = client.settleBrowser.bind(client);
    dependencies.openBrowser = async () => ({
      capture: spies.capture,
      close: async () => {
        current = NOW + 241_000;
      },
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(settlementBody).toMatchObject({
      schemaVersion: 1,
      batchToken: acquisition.batchToken,
      measuredBrowserMs: 241_000,
    });
    expect(report.status).toBe('systemic_stop');
    expect(report).toMatchObject({ browserClosed: true, browserSettled: true });
    expect(report.error).toBe('asset publisher quota or reservation');
  });

  test.each([
    'storage_guard',
    'storage_limit',
  ] as const)('the real client accepts the bounded %s revalidation response', async (status) => {
    const client = new ConvexPublisherClient({
      pollUrl: 'https://convex.example.com/poll',
      executorBaseUrl: 'https://convex.example.com/executor',
      pollToken: 'poll-token',
      executorToken: 'executor-token',
      fetcher: async () => Response.json({ ok: true, status }),
    });
    await expect(client.revalidate(claim)).resolves.toEqual({ status });
  });

  test('an overrun beyond the settlement window keeps the reservation unsettled', async () => {
    let current = NOW;
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ok: true, status: 'settled' }));
    const client = new ConvexPublisherClient({
      pollUrl: 'https://convex.example.com/poll',
      executorBaseUrl: 'https://convex.example.com/executor',
      pollToken: 'poll-token',
      executorToken: 'executor-token',
      fetcher,
      now: () => current,
    });
    const { dependencies, spies } = setup({ now: () => current });
    dependencies.client.settleBrowser = client.settleBrowser.bind(client);
    dependencies.openBrowser = async () => ({
      capture: spies.capture,
      close: async () => {
        current = NOW + 520_000;
      },
    });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'systemic_stop',
      browserClosed: true,
      browserSettled: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
    expect(spies.releaseBatch).not.toHaveBeenCalled();
  });

  test('a stalled real HTTP settlement times out and keeps the reservation unsettled', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const fetcher: typeof fetch = async () => await new Promise<Response>(() => {});
      const client = new ConvexPublisherClient({
        pollUrl: 'https://convex.example.com/poll',
        executorBaseUrl: 'https://convex.example.com/executor',
        pollToken: 'poll-token',
        executorToken: 'executor-token',
        fetcher,
        now: Date.now,
      });
      const { dependencies, spies } = setup({ now: Date.now });
      dependencies.client.settleBrowser = client.settleBrowser.bind(client);
      dependencies.openBrowser = async () => ({
        capture: spies.capture,
        close: async () => {
          vi.setSystemTime(NOW + 241_000);
        },
      });
      const execution = executeOwnedBatch(dependencies, config, acquisition, NOW);
      await vi.advanceTimersByTimeAsync(30_000);
      const report = await execution;
      expect(report).toMatchObject({
        status: 'systemic_stop',
        browserClosed: true,
        browserSettled: false,
      });
      expect(spies.releaseBatch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('one absolute deadline stops a stalled capture and never opens a replacement browser', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const { dependencies, spies } = setup({ now: Date.now });
      const openBrowser = vi.fn(async () => ({
        capture: async () => await new Promise<never>(() => {}),
        close: spies.close,
      }));
      dependencies.openBrowser = openBrowser;
      const execution = executeOwnedBatch(
        dependencies,
        {
          ...config,
          softDeadlineMs: 6_000,
          browserCaptureTimeoutMs: 100,
          browserCleanupGraceMs: 100,
        },
        acquisition,
        NOW
      );
      await vi.advanceTimersByTimeAsync(100);
      const report = await execution;
      expect(report).toMatchObject({
        status: 'systemic_stop',
        error: 'asset publisher timeout',
      });
      expect(openBrowser).toHaveBeenCalledOnce();
      expect(spies.close).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test('an unprovable post-ownership Convex header stall still closes, settles, and returns', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const fetcher: typeof fetch = async () => await new Promise<Response>(() => {});
      const { dependencies, spies } = setup({
        now: Date.now,
        claim: async (_batchToken, deadlineAt) =>
          (await postJson(
            'https://convex.example.com/claim',
            'executor-token',
            {},
            {
              fetcher,
              deadlineAt,
            }
          )) as typeof claim,
      });
      const execution = executeOwnedBatch(
        dependencies,
        {
          ...config,
          softDeadlineMs: 6_000,
          browserCaptureTimeoutMs: 100,
          browserCleanupGraceMs: 100,
        },
        acquisition,
        NOW
      );
      await vi.advanceTimersByTimeAsync(1_000);
      const report = await execution;
      expect(report).toMatchObject({
        status: 'systemic_stop',
        browserClosed: true,
        browserSettled: true,
      });
      expect(spies.close).toHaveBeenCalledOnce();
      expect(spies.settleBrowser).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  test.each([
    'after_lease',
    'after_browser_open',
    'after_claim',
    'after_render',
    'before_upload',
    'after_upload',
    'before_completion',
    'after_completion',
  ] as const)('failure injection at %s leaves a bounded owned outcome', async (point) => {
    const { dependencies, spies } = setup({ fault: point });
    const report = await executeOwnedBatch(dependencies, config, acquisition, NOW);
    expect(['failed', 'systemic_stop', 'completed']).toContain(report.status);
    if (point === 'after_lease') {
      expect(spies.openBrowser).not.toHaveBeenCalled();
      expect(spies.releaseBatch).toHaveBeenCalledWith(
        acquisition.batchToken,
        'no_browser',
        expect.any(Number)
      );
    }
    if (point === 'after_completion') {
      expect(report).toMatchObject({ status: 'completed', completed: true });
    }
  });
});

describe('size-two owned batch execution', () => {
  const sizeTwoConfig: PublisherConfig = { ...config, maxItems: 2 };
  const secondClaim: ClaimedTarget = {
    ...claim,
    targetId: 'target-two',
    factionId: 'faction-two',
    claimToken: 'claim-token-0000000000000002',
    payloadHash: 'b'.repeat(64),
    renderCapability: 'render-capability-token-000000002',
  };

  test('checkpoints two foreground successes under one Browser and releases once after settlement', async () => {
    const claimNext = vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(secondClaim);
    const { dependencies, spies } = setup({ claim: claimNext });
    dependencies.client.revalidate = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'valid',
        leaseExpiresAt: claim.leaseExpiresAt,
        factionId: claim.factionId,
        assetType: claim.assetType,
        payloadHash: claim.payloadHash,
      })
      .mockResolvedValueOnce({
        status: 'valid',
        leaseExpiresAt: secondClaim.leaseExpiresAt,
        factionId: secondClaim.factionId,
        assetType: secondClaim.assetType,
        payloadHash: secondClaim.payloadHash,
      });
    const report = await executeOwnedBatch(dependencies, sizeTwoConfig, acquisition, NOW);

    expect(report).toMatchObject({
      status: 'completed',
      browserOpened: true,
      browserClosed: true,
      browserSettled: true,
      telemetry: {
        configuredMaxItems: 2,
        effectiveMaxItems: 2,
        stopReason: 'max_items',
        batchReleased: true,
        counts: { claimed: 2, completed: 2, stale: 0, failed: 0 },
        items: [
          { index: 0, outcome: 'completed' },
          { index: 1, outcome: 'completed' },
        ],
      },
    });
    expect(claimNext).toHaveBeenCalledTimes(2);
    expect(spies.openBrowser).toHaveBeenCalledOnce();
    expect(spies.capture).toHaveBeenCalledTimes(2);
    expect(spies.complete).toHaveBeenCalledTimes(2);
    expect(spies.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ targetId: claim.targetId }),
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      true
    );
    expect(spies.complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ targetId: secondClaim.targetId }),
      expect.any(String),
      expect.any(Number),
      expect.any(Number),
      true
    );
    expect(spies.complete).toHaveBeenCalledBefore(spies.settleBrowser);
    expect(spies.settleBrowser).toHaveBeenCalledBefore(spies.releaseBatch);
    expect(spies.settleBrowser).toHaveBeenCalledOnce();
    expect(spies.releaseBatch).toHaveBeenCalledOnce();
  });

  test('a second empty claim stops cleanly after one compatible success', async () => {
    const claimNext = vi
      .fn()
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce({ status: 'empty' as const });
    const { dependencies, spies } = setup({ claim: claimNext });
    const report = await executeOwnedBatch(dependencies, sizeTwoConfig, acquisition, NOW);

    expect(report).toMatchObject({
      status: 'completed',
      completed: true,
      telemetry: {
        stopReason: 'empty',
        batchReleased: true,
        counts: { claimed: 1, completed: 1, stale: 0, failed: 0 },
      },
    });
    expect(claimNext).toHaveBeenCalledTimes(2);
    expect(spies.capture).toHaveBeenCalledOnce();
    expect(spies.releaseBatch).toHaveBeenCalledOnce();
  });

  test('a second ordinary failure checkpoints exactly and does not attempt a third item', async () => {
    const claimNext = vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(secondClaim);
    const { dependencies, spies } = setup({ claim: claimNext });
    spies.capture
      .mockResolvedValueOnce({
        bytes: new Uint8Array(3),
        pageCount: 2,
        pageWidthMm: 210,
        pageHeightMm: 297,
        consoleErrors: [],
        requestFailures: [],
        pageErrors: [],
        httpErrors: [],
      })
      .mockRejectedValueOnce(new Error('second capture failed'));

    const report = await executeOwnedBatch(dependencies, sizeTwoConfig, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'failed',
      completed: true,
      telemetry: {
        stopReason: 'failure',
        batchReleased: true,
        counts: { claimed: 2, completed: 1, stale: 0, failed: 1 },
      },
    });
    expect(claimNext).toHaveBeenCalledTimes(2);
    expect(spies.fail).toHaveBeenCalledOnce();
    expect(spies.fail).toHaveBeenCalledBefore(spies.settleBrowser);
    expect(spies.settleBrowser).toHaveBeenCalledBefore(spies.releaseBatch);
  });

  test('a second stale item releases exact ownership and ends the loop', async () => {
    const claimNext = vi.fn().mockResolvedValueOnce(claim).mockResolvedValueOnce(secondClaim);
    const { dependencies, spies } = setup({ claim: claimNext });
    vi.mocked(dependencies.client.revalidate)
      .mockResolvedValueOnce({
        status: 'valid',
        leaseExpiresAt: claim.leaseExpiresAt,
        factionId: claim.factionId,
        assetType: claim.assetType,
        payloadHash: claim.payloadHash,
      })
      .mockResolvedValueOnce({ status: 'stale' });

    const report = await executeOwnedBatch(dependencies, sizeTwoConfig, acquisition, NOW);
    expect(report).toMatchObject({
      status: 'stale',
      telemetry: {
        stopReason: 'stale',
        batchReleased: true,
        counts: { claimed: 2, completed: 1, stale: 1, failed: 0 },
      },
    });
    expect(claimNext).toHaveBeenCalledTimes(2);
    expect(spies.release).toHaveBeenCalledWith(
      expect.objectContaining({ targetId: secondClaim.targetId }),
      expect.any(Number),
      true
    );
    expect(spies.release).toHaveBeenCalledBefore(spies.settleBrowser);
    expect(spies.settleBrowser).toHaveBeenCalledBefore(spies.releaseBatch);
  });
});
