import { afterEach, describe, expect, test, vi } from 'vitest';

import { rendererManifest } from './renderer-manifest.generated';
import { fakeR2Object } from './test-helpers';

const browserMocks = vi.hoisted(() => ({ open: vi.fn() }));

vi.mock('./browser', async (importOriginal) => ({
  ...(await importOriginal()),
  openPublisherBrowser: browserMocks.open,
}));

import publisherWorker from './index';

const NOW = Date.parse('2026-07-17T12:00:00.000Z');
const GIT_SHA = 'a'.repeat(40);

function publisherEnv(): Env {
  return {
    PUBLIC_BASE_URL: 'https://dune.zone',
    CAPTURE_BASE_URL: 'https://publisher.invalid',
    CONVEX_EXECUTOR_BASE_URL: 'https://convex.invalid/asset-publishing/executor',
    CONVEX_RENDER_URL: 'https://convex.invalid/asset-publishing/render',
    GIT_SHA,
    WORK_WINDOW_MS: '240000',
    BROWSER_CAPTURE_TIMEOUT_MS: '45000',
    BROWSER_CLEANUP_GRACE_MS: '15000',
    PDF_MAX_BYTES: '8000000',
    ASSET_PUBLISHER_EXECUTOR_SECRET: 'executor-secret-not-shared',
    CF_VERSION_METADATA: {
      id: 'worker-version-one',
      tag: GIT_SHA,
      timestamp: '2026-07-17T12:00:00.000Z',
    },
    ASSETS: {
      fetch: vi.fn(async () => new Response('<html>spa shell</html>', { status: 200 })),
    },
    GAME_SERVICE: {
      fetch: vi.fn(async () => Response.json({ service: 'game' }, { headers: { 'Cache-Control': 'no-store' } })),
    },
    PLAY_INGRESS_RATE_LIMIT: { limit: vi.fn(async () => ({ success: true })) },
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
  test('forwards the canonical game namespace to its bound Worker instead of the SPA', async () => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(new Request('https://dune.zone/__play/health'), currentEnv, {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext);
    await expect(response.json()).resolves.toEqual({ service: 'game' });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
    expect(currentEnv.PLAY_INGRESS_RATE_LIMIT.limit).not.toHaveBeenCalled();
  });

  test('limits unknown game IDs before calling the game Worker or creating a Durable Object', async () => {
    const currentEnv = publisherEnv();
    vi.mocked(currentEnv.PLAY_INGRESS_RATE_LIMIT.limit).mockResolvedValueOnce({ success: false });
    const response = await publisherWorker.fetch(
      new Request('https://dune.zone/__play/games/unknown/socket', {
        headers: { 'CF-Connecting-IP': '192.0.2.17', 'X-Forwarded-For': 'attacker-controlled' },
      }),
      currentEnv,
      { waitUntil: vi.fn() } as unknown as ExecutionContext
    );
    expect(response.status).toBe(429);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Retry-After')).toBe('10');
    expect(currentEnv.PLAY_INGRESS_RATE_LIMIT.limit).toHaveBeenCalledWith({ key: 'connect:192.0.2.17' });
    expect(currentEnv.GAME_SERVICE.fetch).not.toHaveBeenCalled();
  });

  test.each(['provision', 'account-deletion'])(
    'gives %s callbacks a separate per-IP quota without a game-ID bypass',
    async (operation) => {
      const currentEnv = publisherEnv();
      await publisherWorker.fetch(
        new Request(`https://dune.zone/__play/games/any-id/${operation}`, {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '192.0.2.18' },
        }),
        currentEnv,
        { waitUntil: vi.fn() } as unknown as ExecutionContext
      );
      expect(currentEnv.PLAY_INGRESS_RATE_LIMIT.limit).toHaveBeenCalledWith({ key: 'callback:192.0.2.18' });
    }
  );

  test('forwards game requests with Worker-supported manual redirect handling and preserves their body', async () => {
    const currentEnv = publisherEnv();
    const request = new Request('https://dune.zone/__play/games/game-one/provision', {
      method: 'POST',
      body: JSON.stringify({ gameId: 'game-one' }),
      redirect: 'error',
    });
    await publisherWorker.fetch(request, currentEnv, { waitUntil: vi.fn() } as unknown as ExecutionContext);
    const [forwarded] = vi.mocked(currentEnv.GAME_SERVICE.fetch).mock.calls[0]!;
    expect(forwarded).toBeInstanceOf(Request);
    const delivered = forwarded as Request;
    expect(delivered.redirect).toBe('manual');
    expect(delivered.method).toBe('POST');
    await expect(delivered.json()).resolves.toEqual({ gameId: 'game-one' });
  });

  test.each([301, 302, 303, 307, 308])(
    'refuses a %i game service redirect without returning its location',
    async (status) => {
      const currentEnv = publisherEnv();
      vi.mocked(currentEnv.GAME_SERVICE.fetch).mockResolvedValueOnce(
        new Response(null, {
          status,
          headers: { Location: 'https://other.example' },
        })
      );
      const response = await publisherWorker.fetch(new Request('https://dune.zone/__play/health'), currentEnv, {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext);
      expect(response.status).toBe(502);
      expect(response.headers.get('Location')).toBeNull();
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
  );

  test.each([
    'https://faction-sheet-asset-publisher.ndelangen.workers.dev',
    'https://other.example',
    'http://dune.zone',
  ])('refuses game ingress through %s', async (origin) => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(new Request(`${origin}/__play/games/game-one/socket`), currentEnv, {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext);
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(currentEnv.GAME_SERVICE.fetch).not.toHaveBeenCalled();
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
  });

  test.each(['/play', '/play/demo', '/__playground'])('keeps %s in the application', async (pathname) => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(new Request(`https://dune.zone${pathname}`), currentEnv, {
      waitUntil: vi.fn(),
    } as unknown as ExecutionContext);
    await expect(response.text()).resolves.toBe('<html>spa shell</html>');
    expect(currentEnv.GAME_SERVICE.fetch).not.toHaveBeenCalled();
  });

  test('owns reserved namespaces without Static Assets fallthrough', async () => {
    const currentEnv = publisherEnv();
    const response = await publisherWorker.fetch(
      new Request('https://assets.example.com/__asset-publisher/unknown'),
      currentEnv,
      {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext
    );
    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(currentEnv.ASSETS.fetch).not.toHaveBeenCalled();
  });

  test('health reports one current Renderer identity and deployment SHA', async () => {
    const response = await publisherWorker.fetch(
      new Request('https://publisher.example.com/__asset-publisher/health'),
      publisherEnv(),
      {
        waitUntil: vi.fn(),
      } as unknown as ExecutionContext
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
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/rulebook-html/take-work') || String(input).endsWith('/rulebook-pdf/take-work')) {
          return Response.json({ ok: true, schemaVersion: 1, items: [] });
        }
        return Response.json({
          ok: true,
          schemaVersion: 1,
          status: 'empty',
          reason: 'disabled',
          recovered: 2,
          items: [],
        });
      })
    );
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await publisherWorker.scheduled({ scheduledTime: NOW, cron: '*/5 * * * *', noRetry: vi.fn() }, publisherEnv());

    expect(browserMocks.open).not.toHaveBeenCalled();
  });

  test('cron captures and completes an assigned job', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/rulebook-html/take-work') || url.endsWith('/rulebook-pdf/take-work')) {
          return Response.json({ ok: true, schemaVersion: 1, items: [] });
        }
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
        output: 'pdf',
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
