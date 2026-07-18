import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/assetPublisherHttp';
import { rendererManifest } from './renderer-manifest.generated';

const browserMocks = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock('./browser', () => ({
  openPublisherBrowser: browserMocks.open,
}));

import { publisherWorker } from './index';

function publisherEnv(): Env {
  return {
    CAPTURE_BASE_URL: 'https://publisher.invalid',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.invalid/asset-publishing/executor',
    CONVEX_RENDER_URL: 'https://convex.invalid/asset-publishing/render',
    SUPPORTED_RENDERER_VERSION: rendererManifest.rendererVersion,
    WORK_WINDOW_MS: '240000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret-not-shared',
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: createCacheSigningSecret(),
    CF_VERSION_METADATA: {
      id: 'worker-version-one',
      tag: 'test-release',
      timestamp: '2026-07-17T12:00:00.000Z',
    },
    ASSETS: {
      fetch: vi.fn(async () => new Response('<html>spa shell</html>', { status: 200 })),
    },
    BROWSER: {},
    ASSET_BUCKET: {},
  } as unknown as Env;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  browserMocks.open.mockReset();
});

describe('publisher Worker scheduled item-list flow', () => {
  test('owns reserved namespaces without Static Assets fallthrough', async () => {
    const currentEnv = publisherEnv();
    const waitUntil = vi.fn();
    const response = await publisherWorker.fetch(
      new Request('https://assets.example.com/__asset-publisher/unknown'),
      currentEnv,
      { waitUntil } as unknown as ExecutionContext
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test('health reports the fixed twenty-item schedule contract', async () => {
    const response = await publisherWorker.fetch(
      new Request('https://publisher.example.com/__asset-publisher/health'),
      publisherEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    await expect(response.json()).resolves.toMatchObject({
      maxItems: 20,
      schedule: '*/5 * * * *',
      supportedRendererVersion: rendererManifest.rendererVersion,
      identity: {
        workerVersionId: 'worker-version-one',
        workerVersionTag: 'test-release',
        workerVersionTimestamp: '2026-07-17T12:00:00.000Z',
        rendererId: expect.stringMatching(/^faction-sheet\/sha256:[0-9a-f]{64}$/),
        rendererManifestDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    });
  });

  test('cron exits without opening a browser when take-work returns empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        expect(url).toContain('/take-work');
        return Response.json({
          ok: true,
          schemaVersion: 1,
          status: 'empty',
          reason: 'no_eligible_work',
          leaseExpiresAt: null,
          items: [],
        });
      })
    );
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await publisherWorker.scheduled(
      { scheduledTime: NOW, cron: '*/5 * * * *', noRetry: vi.fn() },
      publisherEnv()
    );

    expect(browserMocks.open).not.toHaveBeenCalled();
    expect(infoLog).toHaveBeenCalledOnce();
  });

  test('cron opens one browser session when work is assigned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/take-work')) {
          return Response.json({
            ok: true,
            schemaVersion: 1,
            status: 'assigned',
            leaseExpiresAt: NOW + 240_000,
            items: [
              {
                targetId: 'target-one',
                factionId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
                assetType: 'faction_sheet',
                claimToken: 'claim-token-0000000000000001',
                generation: 2,
                rendererVersion: rendererManifest.rendererVersion,
                leaseExpiresAt: NOW + 240_000,
                workLane: 'foreground',
              },
            ],
          });
        }
        if (url.endsWith('/revalidate-item')) {
          return Response.json({
            ok: true,
            status: 'valid',
            factionId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
            assetType: 'faction_sheet',
            leaseExpiresAt: NOW + 240_000,
          });
        }
        if (url.endsWith('/complete-item')) {
          const request = JSON.parse(String(init?.body)) as { cacheToken: string };
          return Response.json({
            ok: true,
            status: 'completed',
            replay: false,
            cacheToken: request.cacheToken,
            publishedAt: NOW,
          });
        }
        throw new Error(`Unexpected request ${url}`);
      })
    );
    browserMocks.open.mockResolvedValue({
      capture: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        payloadHash: 'a'.repeat(64),
      }),
      close: async () => undefined,
      sessionId: () => 'browser-session-one',
    });
    const bucket = {
      head: vi.fn(async () => null),
      put: vi.fn(async () => ({ etag: 'etag-one' }) as R2Object),
    };
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await publisherWorker.scheduled({ scheduledTime: NOW, cron: '*/5 * * * *', noRetry: vi.fn() }, {
      ...publisherEnv(),
      ASSET_BUCKET: bucket,
    } as unknown as Env);

    expect(browserMocks.open).toHaveBeenCalledOnce();
    expect(bucket.put).toHaveBeenCalledOnce();
    expect(infoLog).toHaveBeenCalledOnce();
  });
});

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
