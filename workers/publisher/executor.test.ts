import { describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/publicationHttp';
import { TargetRenderError } from './browser';
import type { PublisherConfig } from './config';
import type { AssignedPublicationJob } from './convex';
import { executeItemList } from './executor';
import type { JpegEncoder } from './image-encode';
import type { AssetBucket } from './r2';
import { fakeR2Object, jpegBytes, pngBytes } from './test-helpers';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const cacheSecret = createCacheSigningSecret();
const cacheToken = `v1.${'a'.repeat(22)}.${'b'.repeat(43)}`;
const config: PublisherConfig = {
  captureBaseUrl: 'https://publisher.example.com',
  convexExecutorBaseUrl: 'https://convex.example.com/executor',
  workWindowMs: 240_000,
  browserCaptureTimeoutMs: 45_000,
  browserCleanupGraceMs: 15_000,
  pdfMaxBytes: 8_000_000,
};
const job: AssignedPublicationJob = {
  jobId: 'job-one',
  assetType: 'faction_sheet',
  assetId: 'faction-one',
  expiresAt: NOW + 300_000,
};

function bucket(put = vi.fn(async () => fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date(NOW) }))) {
  return { put } satisfies AssetBucket;
}

function capturedPdf() {
  return { bytes: new Uint8Array([1, 2, 3]), payloadHash: 'a'.repeat(64), output: 'pdf' as const };
}

function capturedPng() {
  return { bytes: pngBytes(900, 1263), payloadHash: 'a'.repeat(64), output: 'png' as const };
}

const cardJob: AssignedPublicationJob = {
  jobId: 'job-card',
  assetType: 'card-treachery',
  assetId: 'card-one',
  expiresAt: NOW + 300_000,
};

/** No image type reaches the encoder in these tests, so the PDF path only has to satisfy the type. */
const refuseToEncode: JpegEncoder = async () => {
  throw new Error('No image encode expected');
};

describe('single-Renderer Publication execution', () => {
  test('captures each assigned job, replaces its stable object, and completes it', async () => {
    const put = vi.fn(async () => fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date(NOW) }));
    const complete = vi.fn(async () => 'completed' as const);
    const close = vi.fn(async () => undefined);

    await expect(
      executeItemList(config, [job], {
        bucket: bucket(put),
        cacheTokenSecret: cacheSecret,
        client: { complete, fail: vi.fn() },
        openBrowser: async () => ({
          capture: async () => capturedPdf(),
          close,
          sessionId: () => 'browser-session-one',
        }),
        encodeJpeg: refuseToEncode,
        now: () => NOW,
        signCacheToken: async () => cacheToken,
      })
    ).resolves.toEqual({
      assigned: 1,
      rendered: 1,
      completed: 1,
      failed: 0,
      missing: 0,
      unprocessed: 0,
      browserOpened: true,
      browserClosed: true,
      browserSessionId: 'browser-session-one',
      recompressedImages: 0,
      recompressionSavedBytes: 0,
      encodedImages: 0,
    });
    expect(put).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith('job-one', cacheToken, NOW + 15_000);
    expect(close).toHaveBeenCalledOnce();
  });

  test('records a target render failure and continues', async () => {
    const fail = vi.fn(async () => 'pending' as const);
    const put = vi.fn();

    await expect(
      executeItemList(config, [job], {
        bucket: bucket(put),
        cacheTokenSecret: cacheSecret,
        client: { complete: vi.fn(), fail },
        openBrowser: async () => ({
          capture: async () => {
            throw new TargetRenderError('Captured PDF must contain exactly two pages');
          },
          close: async () => undefined,
          sessionId: () => 'browser-session-two',
        }),
        encodeJpeg: refuseToEncode,
        now: () => NOW,
      })
    ).resolves.toMatchObject({ failed: 1, completed: 0, unprocessed: 0 });
    expect(fail).toHaveBeenCalledWith('job-one', expect.any(TargetRenderError), NOW + 15_000);
    expect(put).not.toHaveBeenCalled();
  });

  test('leaves infrastructure failures in progress for expiry recovery and closes the browser', async () => {
    const fail = vi.fn();
    const close = vi.fn(async () => undefined);

    await expect(
      executeItemList(config, [job], {
        bucket: bucket(),
        cacheTokenSecret: cacheSecret,
        client: { complete: vi.fn(), fail },
        openBrowser: async () => ({
          capture: async () => {
            throw new Error('Browser service unavailable');
          },
          close,
          sessionId: () => 'browser-session-infrastructure',
        }),
        encodeJpeg: refuseToEncode,
        now: () => NOW,
      })
    ).rejects.toThrow('Browser service unavailable');
    expect(fail).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });

  test('stops starting new jobs after the work window', async () => {
    let currentTime = NOW;
    const capture = vi.fn(async () => capturedPdf());
    const complete = vi.fn(async () => {
      currentTime = NOW + config.workWindowMs;
      return 'completed' as const;
    });
    const second = { ...job, jobId: 'job-two', assetId: 'faction-two' };

    await expect(
      executeItemList(config, [job, second], {
        bucket: bucket(),
        cacheTokenSecret: cacheSecret,
        client: { complete, fail: vi.fn() },
        openBrowser: async () => ({
          capture,
          close: async () => undefined,
          sessionId: () => 'browser-session-window',
        }),
        encodeJpeg: refuseToEncode,
        now: () => currentTime,
        signCacheToken: async () => cacheToken,
      })
    ).resolves.toMatchObject({ assigned: 2, completed: 1, unprocessed: 1 });
    expect(capture).toHaveBeenCalledOnce();
  });

  test('publishes an image job as the encoded JPEG rather than the captured PNG', async () => {
    const encoded = jpegBytes({ widthPx: 900, heightPx: 1263, progressive: true });
    const put = vi.fn(async () => fakeR2Object({ etag: 'etag-card', size: 3, uploaded: new Date(NOW) }));
    const encodeJpeg = vi.fn(async () => encoded);

    await expect(
      executeItemList(config, [cardJob], {
        bucket: bucket(put),
        cacheTokenSecret: cacheSecret,
        client: { complete: vi.fn(async () => 'completed' as const), fail: vi.fn() },
        openBrowser: async () => ({
          capture: async () => capturedPng(),
          close: async () => undefined,
          sessionId: () => 'browser-session-card',
        }),
        encodeJpeg,
        now: () => NOW,
        signCacheToken: async () => cacheToken,
      })
    ).resolves.toMatchObject({ completed: 1, encodedImages: 1, recompressedImages: 0 });
    expect(encodeJpeg).toHaveBeenCalledWith(expect.any(Uint8Array), 88);
    expect(put).toHaveBeenCalledWith('cards/card-one/card.jpg', encoded, expect.anything());
  });

  test('fails the job rather than publishing a baseline JPEG', async () => {
    const fail = vi.fn(async () => 'pending' as const);
    const put = vi.fn();

    await expect(
      executeItemList(config, [cardJob], {
        bucket: bucket(put),
        cacheTokenSecret: cacheSecret,
        client: { complete: vi.fn(), fail },
        openBrowser: async () => ({
          capture: async () => capturedPng(),
          close: async () => undefined,
          sessionId: () => 'browser-session-baseline',
        }),
        encodeJpeg: async () => jpegBytes({ widthPx: 900, heightPx: 1263, progressive: false }),
        now: () => NOW,
        signCacheToken: async () => cacheToken,
      })
    ).resolves.toMatchObject({ failed: 1, completed: 0, encodedImages: 0 });
    expect(fail).toHaveBeenCalledWith('job-card', expect.any(TargetRenderError), NOW + 15_000);
    expect(put).not.toHaveBeenCalled();
  });
});
