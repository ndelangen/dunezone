import { describe, expect, test, vi } from 'vitest';

import { completePublicationJobRequestSchema } from '../../src/shared/asset-publishing/publication';
import { TargetRenderError } from './browser';
import type { PublisherConfig } from './config';
import type { AssignedPublicationJob } from './convex';
import { executeItemList } from './executor';
import type { JpegEncoder } from './image-encode';
import type { AssetBucket } from './r2';
import { fakeR2Object, jpegBytes, pngBytes } from './test-helpers';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const config: PublisherConfig = {
  publicBaseUrl: 'https://dune.zone',
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
  test('each publication gets a fresh unsigned cache buster shared by storage and completion', async () => {
    const put = vi.fn<AssetBucket['put']>(async () =>
      fakeR2Object({ etag: 'etag-card', size: 3, uploaded: new Date(NOW) })
    );
    const tokens: string[] = [];
    for (let publication = 0; publication < 2; publication += 1) {
      await executeItemList(config, [cardJob], {
        bucket: { put },
        client: {
          complete: async (jobId, cacheToken) => {
            expect(completePublicationJobRequestSchema.safeParse({ schemaVersion: 1, jobId, cacheToken }).success).toBe(
              true
            );
            tokens.push(cacheToken);
            return 'completed';
          },
          fail: vi.fn(),
        },
        openBrowser: async () => ({
          capture: async () => capturedPng(),
          close: async () => undefined,
          sessionId: () => 'browser-session-cache-buster',
        }),
        encodeJpeg: async () => jpegBytes({ widthPx: 900, heightPx: 1263, progressive: true }),
        now: () => NOW,
      });
    }
    expect(tokens).toHaveLength(2);
    expect(new Set(tokens).size).toBe(2);
    expect(tokens.every((token) => !token.startsWith('v1.'))).toBe(true);
    expect(put.mock.calls.map(([key]) => key)).toEqual(['cards/card-one/card.jpg', 'cards/card-one/card.jpg']);
    expect(put.mock.calls.map(([, , options]) => options.customMetadata?.publisherCacheToken)).toEqual(tokens);
  });

  test('captures each assigned job, replaces its stable object, and completes it', async () => {
    const put = vi.fn(async () => fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date(NOW) }));
    const complete = vi.fn(async () => 'completed' as const);
    const close = vi.fn(async () => undefined);

    await expect(
      executeItemList(config, [job], {
        bucket: bucket(put),
        client: { complete, fail: vi.fn() },
        openBrowser: async () => ({
          capture: async () => capturedPdf(),
          close,
          sessionId: () => 'browser-session-one',
        }),
        encodeJpeg: refuseToEncode,
        now: () => NOW,
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
    expect(complete).toHaveBeenCalledWith('job-one', expect.any(String), NOW + 15_000);
    expect(close).toHaveBeenCalledOnce();
  });

  test('records a target render failure and continues', async () => {
    const fail = vi.fn(async () => 'pending' as const);
    const put = vi.fn();

    await expect(
      executeItemList(config, [job], {
        bucket: bucket(put),
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
        client: { complete, fail: vi.fn() },
        openBrowser: async () => ({
          capture,
          close: async () => undefined,
          sessionId: () => 'browser-session-window',
        }),
        encodeJpeg: refuseToEncode,
        now: () => currentTime,
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
        client: { complete: vi.fn(async () => 'completed' as const), fail: vi.fn() },
        openBrowser: async () => ({
          capture: async () => capturedPng(),
          close: async () => undefined,
          sessionId: () => 'browser-session-card',
        }),
        encodeJpeg,
        now: () => NOW,
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
        client: { complete: vi.fn(), fail },
        openBrowser: async () => ({
          capture: async () => capturedPng(),
          close: async () => undefined,
          sessionId: () => 'browser-session-baseline',
        }),
        encodeJpeg: async () => jpegBytes({ widthPx: 900, heightPx: 1263, progressive: false }),
        now: () => NOW,
      })
    ).resolves.toMatchObject({ failed: 1, completed: 0, encodedImages: 0 });
    expect(fail).toHaveBeenCalledWith('job-card', expect.any(TargetRenderError), NOW + 15_000);
    expect(put).not.toHaveBeenCalled();
  });

  test('fails the job rather than aborting the batch when the encoder returns bytes no profiler can read', async () => {
    const fail = vi.fn(async () => 'pending' as const);
    const put = vi.fn();

    await expect(
      executeItemList(config, [cardJob], {
        bucket: bucket(put),
        client: { complete: vi.fn(), fail },
        openBrowser: async () => ({
          capture: async () => capturedPng(),
          close: async () => undefined,
          sessionId: () => 'browser-session-garbage',
        }),
        /* Not merely a wrong JPEG: not a JPEG at all, so profiling throws before any typed assertion runs. */
        encodeJpeg: async () => new Uint8Array([1, 2, 3, 4]),
        now: () => NOW,
      })
    ).resolves.toMatchObject({ failed: 1, completed: 0, unprocessed: 0 });
    expect(fail).toHaveBeenCalledWith('job-card', expect.any(Error), NOW + 15_000);
    expect(put).not.toHaveBeenCalled();
  });
});
