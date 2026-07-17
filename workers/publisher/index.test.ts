import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/assetPublisherHttp';
import { createWakeUp } from './dispatch';
import { rendererManifest } from './renderer-manifest.generated';

const browserMocks = vi.hoisted(() => ({
  available: vi.fn(),
  open: vi.fn(),
}));

vi.mock('./browser', () => ({
  browserAvailable: browserMocks.available,
  openPublisherBrowser: browserMocks.open,
}));

import { publisherWorker } from './index';

const SIGNED_URLS = [
  'https://signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/a.png?token=SECRET_QUERY#SECRET_FRAGMENT',
  '//signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/a.png?token=SECRET_QUERY#SECRET_FRAGMENT',
  '`//signed-user:SECRET_PASSWORD@cdn.example.com/private/SECRET_PATH/a.png?token=SECRET_QUERY#SECRET_FRAGMENT`',
  '//signed-user:SECRET_PASSWORD@cdn.example.com/private/<REDACTED>/SECRET_PATH?token=SECRET_QUERY#SECRET_FRAGMENT',
  '//signed-user:SECRET_PASSWORD@cdn.example.com/private/<Redacted><REDACTED>/SECRET_PATH?token=SECRET_QUERY#SECRET_FRAGMENT',
] as const;
const SECRETS = [
  'signed-user',
  'SECRET_PASSWORD',
  'SECRET_PATH',
  'SECRET_QUERY',
  'SECRET_FRAGMENT',
];
const TRIGGER_ID = '10a5318c-e0f2-49c6-bd19-5221a80643f7';

function publisherEnv(): Env {
  return {
    PUBLISHER_ENABLED: 'true',
    CRON_DISPATCH_ENABLED: 'true',
    CAPTURE_BASE_URL: 'https://publisher.invalid',
    CONVEX_POLL_URL: 'https://convex.invalid/asset-publishing/poll',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.invalid/asset-publishing/executor',
    CONVEX_RENDER_URL: 'https://convex.invalid/asset-publishing/render',
    SUPPORTED_RENDERER_VERSION: rendererManifest.rendererVersion,
    EXECUTOR_MAX_ITEMS: '1',
    SOFT_DEADLINE_MS: '240000',
    UPLOAD_MARGIN_MS: '120000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    QUEUE_MAX_PRE_OWNERSHIP_ATTEMPTS: '2',
    QUEUE_RETRY_DELAY_SECONDS: '60',
    ASSET_PUBLISHER_POLL_SECRET: 'poll-secret-not-shared',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret-not-shared',
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: createCacheSigningSecret(),
    CF_VERSION_METADATA: {
      id: 'worker-version-one',
      tag: 'ticket-7a',
      timestamp: '2026-07-16T12:00:00.000Z',
    },
    ASSETS: {
      fetch: vi.fn(async () => new Response('<html>spa shell</html>', { status: 200 })),
    },
    BROWSER: {},
    ASSET_BUCKET: {},
    PUBLISH_QUEUE: { send: vi.fn() },
  } as unknown as Env;
}

function assertNoSignedUrl(logCalls: unknown[][], signedUrl: string): void {
  const serialized = JSON.stringify(logCalls);
  expect(serialized).not.toContain('cdn.example.com');
  expect(serialized).not.toContain(signedUrl);
  for (const secret of SECRETS) expect(serialized).not.toContain(secret);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  browserMocks.available.mockReset();
  browserMocks.open.mockReset();
});

describe('publisher Worker structured-log security boundary', () => {
  test.each([
    '/published',
    '/published/',
    '/published/factions/mutable-slug/sheet.pdf',
    '/published/extra',
    '/__asset-publisher',
    '/__asset-publisher/unknown',
    '/publisher-capture',
    '/publisher-capture/unknown.js',
  ])('owns reserved namespaces without Static Assets fallthrough: %s', async (pathname) => {
    const currentEnv = publisherEnv();
    const waitUntil = vi.fn();
    const response = await publisherWorker.fetch(
      new Request(`https://assets.example.com${pathname}`),
      currentEnv,
      { waitUntil } as unknown as ExecutionContext
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  test.each([
    '/',
    '/factions',
    '/factions/mutable-slug',
    '/factions/j57c8t9m2q4w6e8r0y2u4i6o8p0a2s4d/sheet.pdf',
    '/rulesets/example',
    '/public/app-hash.js',
  ])('leaves ordinary application routes and assets to Static Assets: %s', async (pathname) => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(
      new Request(`https://assets.example.com${pathname}`),
      currentEnv,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('spa shell');
    expect(currentEnv.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  test('health reports exact Worker version and generated renderer identity', async () => {
    const response = await publisherWorker.fetch(
      new Request('https://publisher.example.com/__asset-publisher/health'),
      publisherEnv(),
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    await expect(response.json()).resolves.toMatchObject({
      maxItems: 1,
      supportedRendererVersion: rendererManifest.rendererVersion,
      identity: {
        workerVersionId: 'worker-version-one',
        workerVersionTag: 'ticket-7a',
        workerVersionTimestamp: '2026-07-16T12:00:00.000Z',
        rendererId: expect.stringMatching(/^faction-sheet\/sha256:[0-9a-f]{64}$/),
        rendererManifestDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
        configuredRendererVersion: rendererManifest.rendererVersion,
        rendererConfigurationMatchesManifest: true,
      },
      rendererSupport: {
        supportedRendererVersions: rendererManifest.supportedRendererVersions,
        rendererId: rendererManifest.rendererId,
        configuredRendererVersion: rendererManifest.rendererVersion,
        configurationMatchesManifest: true,
      },
    });
  });

  test('health reports the configured size-two executor without changing Queue batch shape', async () => {
    const environment = publisherEnv();
    (environment as unknown as { EXECUTOR_MAX_ITEMS: string }).EXECUTOR_MAX_ITEMS = '2';
    const response = await publisherWorker.fetch(
      new Request('https://publisher.example.com/__asset-publisher/health'),
      environment,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    await expect(response.json()).resolves.toMatchObject({ maxItems: 2 });
  });

  test('health never advertises an unsupported renderer version as compatible', async () => {
    const environment = publisherEnv();
    (environment as unknown as { SUPPORTED_RENDERER_VERSION: string }).SUPPORTED_RENDERER_VERSION =
      'mutable-renderer-alias';
    const response = await publisherWorker.fetch(
      new Request('https://publisher.example.com/__asset-publisher/health'),
      environment,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    await expect(response.json()).resolves.toMatchObject({
      supportedRendererVersion: rendererManifest.rendererVersion,
      rendererSupport: {
        supportedRendererVersions: rendererManifest.supportedRendererVersions,
        rendererId: rendererManifest.rendererId,
        configuredRendererVersion: 'mutable-renderer-alias',
        configurationMatchesManifest: false,
      },
    });
  });

  test.each(SIGNED_URLS)('Cron omits a rejected poll diagnostic: %s', async (signedUrl) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`Cron poll rejected ${signedUrl}`);
      })
    );
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const now = Date.now();

    await publisherWorker.scheduled(
      { scheduledTime: now, cron: '*/15 * * * *', noRetry: vi.fn() },
      publisherEnv()
    );

    expect(errorLog).toHaveBeenCalledOnce();
    assertNoSignedUrl(errorLog.mock.calls, signedUrl);
  });

  test.each(
    SIGNED_URLS
  )('Queue omits a consumer-owned secret-bearing diagnostic: %s', async (signedUrl) => {
    const now = Date.now();
    const wakeUp = createWakeUp(now, TRIGGER_ID);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith('/acquire')) {
        return Response.json({
          ok: true,
          schemaVersion: 1,
          status: 'acquired',
          replay: false,
          batchToken: TRIGGER_ID,
          leaseExpiresAt: now + 720_000,
          browserReservationMs: 240_000,
          dailyBrowserMs: 240_000,
        });
      }
      if (url.endsWith('/release-batch')) {
        return Response.json({ ok: true, status: 'released' });
      }
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal('fetch', fetcher);
    browserMocks.available.mockRejectedValue(new Error(`Browser availability failed ${signedUrl}`));
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const ack = vi.fn();

    await publisherWorker.queue(
      {
        messages: [
          {
            id: 'message-one',
            timestamp: new Date(now),
            body: wakeUp,
            attempts: 1,
            retry: vi.fn(),
            ack,
          },
        ],
        queue: 'faction-sheet-publisher',
        metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } },
        retryAll: vi.fn(),
        ackAll: vi.fn(),
      },
      publisherEnv()
    );

    expect(ack).toHaveBeenCalledOnce();
    expect(infoLog).toHaveBeenCalledOnce();
    expect(JSON.stringify(infoLog.mock.calls)).not.toContain('asset_publisher_item_telemetry');
    assertNoSignedUrl(infoLog.mock.calls, signedUrl);
  });
});
