import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/publicationHttp';
import { rendererManifest } from './renderer-manifest.generated';
import { fakeR2Object } from './test-helpers';

const browserMocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('./browser', async (importOriginal) => ({
  ...(await importOriginal()),
  openPublisherBrowser: browserMocks.open,
}));

import { publisherWorker } from './index';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const GIT_SHA = 'a'.repeat(40);

function publisherEnv(): Env {
  return {
    CAPTURE_BASE_URL: 'https://publisher.invalid',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.invalid/asset-publishing/executor',
    CONVEX_RENDER_URL: 'https://convex.invalid/asset-publishing/render',
    GIT_SHA,
    WORK_WINDOW_MS: '240000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret-not-shared',
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: createCacheSigningSecret(),
    CF_VERSION_METADATA: {
      id: 'worker-version-one',
      tag: GIT_SHA,
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

describe('publisher Worker Publication flow', () => {
  test('redirects the Storybook entry to its canonical trailing-slash URL', async () => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(
      new Request('https://dune.zone/__storybook?path=/story/example'),
      currentEnv,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('Location')).toBe(
      'https://dune.zone/__storybook/?path=/story/example'
    );
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
  });

  test('serves the Storybook manager entry while preserving its query string', async () => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(
      new Request('https://dune.zone/__storybook/?path=/story/example'),
      currentEnv,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );

    expect(response.status).toBe(200);
    expect(currentEnv.ASSETS.fetch).toHaveBeenCalledOnce();
    const [assetRequest] = vi.mocked(currentEnv.ASSETS.fetch).mock.calls[0];
    expect((assetRequest as Request).url).toBe(
      'https://dune.zone/__storybook/index.html?path=/story/example'
    );
  });

  test('owns reserved namespaces without Static Assets fallthrough', async () => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(
      new Request('https://assets.example.com/__asset-publisher/unknown'),
      currentEnv,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
  });

  test('health reports one current Renderer identity and deployment SHA', async () => {
    const response = await publisherWorker.fetch(
      new Request('https://publisher.example.com/__asset-publisher/health'),
      publisherEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    await expect(response.json()).resolves.toMatchObject({
      maxItems: 20,
      schedule: '*/5 * * * *',
      rendererIdentity: rendererManifest.rendererIdentity,
      identity: {
        gitSha: GIT_SHA,
        workerVersionId: 'worker-version-one',
        workerVersionTag: GIT_SHA,
        rendererIdentity: rendererManifest.rendererIdentity,
        rendererManifestDigest: rendererManifest.digest,
      },
    });
  });

  test('cron exits without opening a browser when work pickup is disabled', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({
          ok: true,
          schemaVersion: 1,
          status: 'empty',
          reason: 'disabled',
          recovered: 2,
          items: [],
        })
      )
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await publisherWorker.scheduled(
      { scheduledTime: NOW, cron: '*/5 * * * *', noRetry: vi.fn() },
      publisherEnv()
    );

    expect(browserMocks.open).not.toHaveBeenCalled();
  });

  test('cron captures and completes an assigned job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/take-work')) {
          return Response.json({
            ok: true,
            schemaVersion: 1,
            status: 'assigned',
            recovered: 0,
            items: [
              {
                jobId: 'job-one',
                assetId: 'j57d9kz4ktbkpa12nb7j7s7w8h7ygb8p',
                assetType: 'faction_sheet',
                expiresAt: NOW + 300_000,
              },
            ],
          });
        }
        if (url.endsWith('/complete-job')) {
          return Response.json({ ok: true, status: 'completed', publishedAt: NOW });
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
      put: vi.fn(async () => fakeR2Object({ etag: 'etag-one', size: 3, uploaded: new Date(NOW) })),
    };
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await publisherWorker.scheduled({ scheduledTime: NOW, cron: '*/5 * * * *', noRetry: vi.fn() }, {
      ...publisherEnv(),
      ASSET_BUCKET: bucket,
    } as unknown as Env);

    expect(browserMocks.open).toHaveBeenCalledOnce();
    expect(bucket.put).toHaveBeenCalledOnce();
  });
});
