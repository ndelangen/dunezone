import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret } from '../../convex/lib/assetPublisherHttp';
import { createWakeUp } from './dispatch';

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

function publisherEnv(now: number): Env {
  return {
    PUBLISHER_ENABLED: 'true',
    CRON_DISPATCH_ENABLED: 'true',
    CAPTURE_BASE_URL: 'https://publisher.invalid',
    CONVEX_POLL_URL: 'https://convex.invalid/asset-publishing/poll',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.invalid/asset-publishing/executor',
    CONVEX_RENDER_URL: 'https://convex.invalid/asset-publishing/render',
    SUPPORTED_RENDERER_VERSION: 'faction-sheet-v1',
    EXECUTOR_MAX_ITEMS: '1',
    SOFT_DEADLINE_MS: '480000',
    UPLOAD_MARGIN_MS: '120000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '2000000',
    QUEUE_MAX_PRE_OWNERSHIP_ATTEMPTS: '2',
    QUEUE_RETRY_DELAY_SECONDS: '60',
    R2_STORAGE_CEILING_BYTES: '8000000000',
    R2_ESTIMATED_INVENTORY_BYTES: '0',
    R2_INVENTORY_OBSERVED_AT_MS: String(now),
    R2_INVENTORY_MAX_AGE_MS: '86400000',
    R2_UNACCOUNTED_WRITE_BUDGET_BYTES: '200000000',
    ASSET_PUBLISHER_POLL_SECRET: 'poll-secret-not-shared',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret-not-shared',
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: createCacheSigningSecret(),
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
  expect(serialized).toContain('https://cdn.example.com/<redacted>');
  expect(serialized.match(/<redacted>/g)).toHaveLength(1);
  if (signedUrl.startsWith('`')) {
    expect(serialized).toContain('`https://cdn.example.com/<redacted>`');
  }
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
    const currentEnv = publisherEnv(Date.now());
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
    const currentEnv = publisherEnv(Date.now());
    const response = await publisherWorker.fetch(
      new Request(`https://assets.example.com${pathname}`),
      currentEnv,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('spa shell');
    expect(currentEnv.ASSETS.fetch).toHaveBeenCalledOnce();
  });

  test.each(SIGNED_URLS)('Cron redacts a rejected poll URL: %s', async (signedUrl) => {
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
      publisherEnv(now)
    );

    expect(errorLog).toHaveBeenCalledOnce();
    assertNoSignedUrl(errorLog.mock.calls, signedUrl);
  });

  test.each(
    SIGNED_URLS
  )('Queue redacts a consumer-owned error report URL: %s', async (signedUrl) => {
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
          browserReservationMs: 480_000,
          dailyBrowserMs: 480_000,
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
      publisherEnv(now)
    );

    expect(ack).toHaveBeenCalledOnce();
    expect(infoLog).toHaveBeenCalledOnce();
    assertNoSignedUrl(infoLog.mock.calls, signedUrl);
  });
});
