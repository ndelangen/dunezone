import { describe, expect, test, vi } from 'vitest';

import type { PublisherConfig } from './config';
import type { AcquireResult, ClaimedTarget, ExactClaim } from './convex';
import { createWakeUp } from './dispatch';
import { PublisherHttpError } from './http';
import {
  consumePublisherMessage,
  type PublisherQueueMessage,
  type QueueDependencies,
} from './queue';
import type { AssetBucket } from './r2';
import { rendererManifest } from './renderer-manifest.generated';
import type { PublisherBuildIdentity } from './telemetry';
import { fakeR2Object } from './test-helpers';

const NOW = Date.parse('2026-07-16T12:00:00.000Z');
const identity: PublisherBuildIdentity = {
  workerVersionId: 'worker-version-one',
  workerVersionTag: 'ticket-7a',
  workerVersionTimestamp: '2026-07-16T12:00:00.000Z',
  rendererId: rendererManifest.rendererId,
  rendererManifestDigest: rendererManifest.digest,
  configuredRendererVersion: rendererManifest.rendererVersion,
  rendererConfigurationMatchesManifest: true,
};
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
  browserCleanupGraceMs: 15_000,
  pdfMaxBytes: 8_000_000,
  queueMaxPreOwnershipAttempts: 2,
  queueRetryDelaySeconds: 60,
};

function message(body: unknown, attempts = 1) {
  const ack = vi.fn();
  const retry = vi.fn();
  return {
    value: { id: 'message-one', attempts, body, ack, retry } satisfies PublisherQueueMessage,
    ack,
    retry,
  };
}

function dependencies(acquire: () => Promise<AcquireResult>): QueueDependencies {
  const claim: ClaimedTarget = {
    status: 'claimed',
    replay: false,
    targetId: 'target',
    factionId: 'faction',
    assetType: 'faction_sheet',
    batchToken: 'batch-token-0000000000000001',
    claimToken: 'claim-token-0000000000000001',
    generation: 1,
    rendererVersion: rendererManifest.rendererVersion,
    leaseExpiresAt: NOW + 720_000,
    payloadHash: 'a'.repeat(64),
    renderCapability: 'render-capability-token-000000001',
    renderCapabilityExpiresAt: NOW + 300_000,
  };
  const stored = fakeR2Object({ etag: 'etag', size: 1, uploaded: new Date(NOW) });
  const bucket: AssetBucket = {
    head: async () => null,
    put: async () => stored,
  };
  return {
    client: {
      acquire,
      claim: async () => claim,
      settleBrowser: async () => 'settled',
      releaseBatch: async () => 'released',
      revalidate: async () => ({
        status: 'valid',
        leaseExpiresAt: claim.leaseExpiresAt,
        factionId: claim.factionId,
        assetType: claim.assetType,
        payloadHash: claim.payloadHash,
      }),
      complete: async (_claim: ExactClaim, _etag: string, _bytes: number) => 'completed',
      fail: async (_claim: ExactClaim, _error: string) => 'failed',
      release: async (_claim: ExactClaim) => 'released',
    },
    owned: {
      bucket,
      browserAvailable: async () => true,
      openBrowser: async () => ({
        sessionId: () => 'browser-session-sensitive-0001',
        capture: async () => ({
          bytes: new Uint8Array([1]),
          pageCount: 2,
          pageWidthMm: 150,
          pageHeightMm: 195,
          consoleErrors: [],
          requestFailures: [],
          pageErrors: [],
          httpErrors: [],
        }),
        close: async () => undefined,
      }),
      now: () => NOW,
    },
    identity,
    queueName: 'faction-sheet-publisher',
    now: () => NOW,
    log: vi.fn(),
  };
}

describe('Queue acknowledgement and retry policy', () => {
  const wakeUp = createWakeUp(NOW, '10a5318c-e0f2-49c6-bd19-5221a80643f7');

  test('invalid messages are acknowledged before Convex or Browser work', async () => {
    const delivery = message({ targetId: 'forbidden' });
    const acquire = vi.fn(async () => ({ status: 'busy' as const }));
    await expect(
      consumePublisherMessage(delivery.value, config, dependencies(acquire))
    ).resolves.toEqual({ action: 'ack', reason: 'invalid' });
    expect(delivery.ack).toHaveBeenCalledOnce();
    expect(acquire).not.toHaveBeenCalled();
  });

  test.each([
    { status: 'empty', reason: 'no_eligible_work' },
    { status: 'busy', leaseExpiresAt: NOW + 1 },
  ] as const)('$status acquisition is acknowledged without Browser work', async (result) => {
    const delivery = message(wakeUp);
    const deps = dependencies(async () => result);
    const open = vi.spyOn(deps.owned, 'openBrowser');
    const outcome = await consumePublisherMessage(delivery.value, config, deps);
    expect(outcome).toMatchObject({ action: 'ack', reason: result.status });
    expect(delivery.ack).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  test('one transient pre-ownership failure retries with bounded delay', async () => {
    const delivery = message(wakeUp, 1);
    const deps = dependencies(async () => {
      throw new PublisherHttpError('temporary', true, 503);
    });
    await expect(consumePublisherMessage(delivery.value, config, deps)).resolves.toEqual({
      action: 'retry',
      reason: 'transient_before_ownership',
    });
    expect(delivery.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(delivery.ack).not.toHaveBeenCalled();
  });

  test('Queue redelivery reuses the same caller-supplied acquisition token', async () => {
    const acquire = vi.fn(async () => ({ status: 'busy' as const }));
    const first = message(wakeUp, 1);
    const second = message(wakeUp, 2);
    await consumePublisherMessage(first.value, config, dependencies(acquire));
    await consumePublisherMessage(second.value, config, dependencies(acquire));
    expect(acquire).toHaveBeenNthCalledWith(1, wakeUp.triggerId, NOW + config.softDeadlineMs);
    expect(acquire).toHaveBeenNthCalledWith(2, wakeUp.triggerId, NOW + config.softDeadlineMs);
  });

  test('reuses the same authenticated acquisition token after a lost acquire response', async () => {
    const acquired: Extract<AcquireResult, { status: 'acquired' }> = {
      status: 'acquired',
      replay: true,
      batchToken: wakeUp.triggerId,
      leaseExpiresAt: NOW + 720_000,
      browserReservationMs: 240_000,
      dailyBrowserMs: 240_000,
    };
    const acquire = vi
      .fn()
      .mockRejectedValueOnce(new PublisherHttpError('lost response', true))
      .mockResolvedValueOnce(acquired);

    const first = message(wakeUp, 1);
    await consumePublisherMessage(first.value, config, dependencies(acquire));
    const second = message(wakeUp, 2);
    await consumePublisherMessage(second.value, config, dependencies(acquire));

    expect(acquire).toHaveBeenNthCalledWith(1, wakeUp.triggerId, NOW + config.softDeadlineMs);
    expect(acquire).toHaveBeenNthCalledWith(2, wakeUp.triggerId, NOW + config.softDeadlineMs);
    expect(first.retry).toHaveBeenCalledOnce();
    expect(second.ack).toHaveBeenCalledOnce();
  });

  test('retry exhaustion and permanent errors are acknowledged', async () => {
    for (const error of [
      new PublisherHttpError('temporary', true, 503),
      new PublisherHttpError('invalid', false, 400),
    ]) {
      const delivery = message(wakeUp, 2);
      const deps = dependencies(async () => {
        throw error;
      });
      expect((await consumePublisherMessage(delivery.value, config, deps)).action).toBe('ack');
      expect(delivery.ack).toHaveBeenCalledOnce();
      expect(delivery.retry).not.toHaveBeenCalled();
    }
  });

  test('a consumer-owned outcome is always acknowledged and never Queue-retried', async () => {
    const delivery = message(wakeUp);
    const acquired: Extract<AcquireResult, { status: 'acquired' }> = {
      status: 'acquired',
      replay: false,
      batchToken: 'batch-token-0000000000000001',
      leaseExpiresAt: NOW + 720_000,
      browserReservationMs: 240_000,
      dailyBrowserMs: 240_000,
    };
    const deps = dependencies(async () => acquired);
    const result = await consumePublisherMessage(delivery.value, config, deps);
    expect(result).toMatchObject({
      action: 'ack',
      reason: 'consumer_owned_outcome',
      report: { status: 'completed' },
    });
    expect(delivery.ack).toHaveBeenCalledOnce();
    expect(delivery.retry).not.toHaveBeenCalled();
    expect(deps.log).toHaveBeenCalledTimes(2);
    const serializedTelemetry = JSON.stringify(vi.mocked(deps.log).mock.calls);
    expect(serializedTelemetry).toContain('asset_publisher_item_telemetry');
    expect(serializedTelemetry).toContain('asset_publisher_invocation_telemetry');
    expect(serializedTelemetry).not.toContain(acquired.batchToken);
    expect(serializedTelemetry).not.toContain('claim-token-0000000000000001');
    expect(serializedTelemetry).not.toContain('render-capability-token-000000001');
    expect(serializedTelemetry).not.toContain('browser-session-sensitive-0001');
    expect(result.report?.telemetry.batchCorrelationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.report?.telemetry.item?.claimCorrelationHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.report?.telemetry.browser.sessionCorrelationHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('a size-two owned outcome emits two bounded item events and one aggregate invocation event', async () => {
    const delivery = message(wakeUp);
    const acquired: Extract<AcquireResult, { status: 'acquired' }> = {
      status: 'acquired',
      replay: false,
      batchToken: 'batch-token-0000000000000001',
      leaseExpiresAt: NOW + 720_000,
      browserReservationMs: 240_000,
      dailyBrowserMs: 240_000,
    };
    const deps = dependencies(async () => acquired);
    const first = await deps.client.claim(acquired.batchToken);
    if (first.status !== 'claimed') throw new Error('Expected first fixture claim');
    const second = {
      ...first,
      targetId: 'target-two',
      factionId: 'faction-two',
      claimToken: 'claim-token-0000000000000002',
      payloadHash: 'b'.repeat(64),
      renderCapability: 'render-capability-token-000000002',
    };
    deps.client.claim = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    deps.client.revalidate = async (exactClaim) => {
      const source = exactClaim.targetId === second.targetId ? second : first;
      return {
        status: 'valid',
        leaseExpiresAt: source.leaseExpiresAt,
        factionId: source.factionId,
        assetType: source.assetType,
        payloadHash: source.payloadHash,
      };
    };

    const result = await consumePublisherMessage(delivery.value, { ...config, maxItems: 2 }, deps);
    expect(result.report?.telemetry).toMatchObject({
      configuredMaxItems: 2,
      effectiveMaxItems: 2,
      batchReleased: true,
      counts: { claimed: 2, completed: 2, stale: 0, failed: 0 },
      items: [{ index: 0 }, { index: 1 }],
    });
    expect(deps.log).toHaveBeenCalledTimes(3);
    const events = vi.mocked(deps.log).mock.calls.map(([event]) => event.event);
    expect(events).toEqual([
      'asset_publisher_item_telemetry',
      'asset_publisher_item_telemetry',
      'asset_publisher_invocation_telemetry',
    ]);
    const serialized = JSON.stringify(vi.mocked(deps.log).mock.calls);
    expect(serialized).not.toContain(acquired.batchToken);
    expect(serialized).not.toContain(first.claimToken);
    expect(serialized).not.toContain(second.claimToken);
  });

  test('a pre-claim systemic stop emits no item event or failed-item count', async () => {
    const delivery = message(wakeUp);
    const acquired: Extract<AcquireResult, { status: 'acquired' }> = {
      status: 'acquired',
      replay: false,
      batchToken: 'batch-token-0000000000000001',
      leaseExpiresAt: NOW + 720_000,
      browserReservationMs: 240_000,
      dailyBrowserMs: 240_000,
    };
    const deps = dependencies(async () => acquired);
    deps.owned.browserAvailable = async () => false;
    const result = await consumePublisherMessage(delivery.value, config, deps);
    expect(result.report?.telemetry).toMatchObject({
      counts: { claimed: 0, completed: 0, stale: 0, failed: 0 },
      item: null,
    });
    expect(deps.log).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(deps.log).mock.calls)).not.toContain(
      'asset_publisher_item_telemetry'
    );
  });

  test('a rejected secret-bearing renderer label cannot survive the report or Queue event', async () => {
    const delivery = message(wakeUp);
    const acquired: Extract<AcquireResult, { status: 'acquired' }> = {
      status: 'acquired',
      replay: false,
      batchToken: 'batch-token-0000000000000001',
      leaseExpiresAt: NOW + 720_000,
      browserReservationMs: 240_000,
      dailyBrowserMs: 240_000,
    };
    const deps = dependencies(async () => acquired);
    const secretRenderer = `Bearer SECRET_RENDERER_TOKEN ${'x'.repeat(100_000)}`;
    const originalClaim = await deps.client.claim(acquired.batchToken);
    if (originalClaim.status !== 'claimed') throw new Error('Expected claimed fixture');
    deps.client.claim = async () => ({ ...originalClaim, rendererVersion: secretRenderer });
    const result = await consumePublisherMessage(delivery.value, config, deps);
    const serialized = JSON.stringify({ result, logs: vi.mocked(deps.log).mock.calls });
    expect(result.report?.telemetry.item).toMatchObject({
      rendererId: rendererManifest.rendererId,
      rendererMismatch: true,
      failureClass: 'renderer',
    });
    expect(serialized).not.toContain('SECRET_RENDERER_TOKEN');
    expect(serialized).not.toContain('rendererVersion');
    expect(serialized).not.toContain('x'.repeat(1_000));
  });
});
