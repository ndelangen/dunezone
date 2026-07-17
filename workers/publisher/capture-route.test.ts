import { afterEach, describe, expect, test, vi } from 'vitest';

import { type CaptureEnv, captureClaimHeader, handleCaptureRoute } from './capture-route';

const claimToken = 'claim-token-0000000000000001';

function env(
  assetFetch = vi.fn(async (_request: Request) => new Response('<html>capture</html>'))
): CaptureEnv {
  return {
    ASSETS: { fetch: assetFetch },
    CONVEX_RENDER_URL: 'https://convex.invalid/asset-publishing/render',
  };
}

afterEach(() => vi.unstubAllGlobals());

function stubValidClaim() {
  const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const token = new Headers(init?.headers).get('Authorization')?.replace('Bearer ', '');
    if (token !== claimToken) return Response.json({ ok: false }, { status: 404 });
    return Response.json({ ok: true, payload: {}, payloadHash: 'a'.repeat(64) });
  });
  vi.stubGlobal('fetch', upstream);
  return upstream;
}

describe('dedicated exact-snapshot capture boundary', () => {
  test('capture document is hidden without the item claim', async () => {
    const assetFetch = vi.fn();
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/__asset-publisher/capture'),
      env(assetFetch)
    );
    expect(response?.status).toBe(404);
    expect(assetFetch).not.toHaveBeenCalled();
  });

  test('serves only the top-level capture document with no-store', async () => {
    const upstream = stubValidClaim();
    const assetFetch = vi.fn(async (_request: Request) => new Response('<html>capture</html>'));
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/__asset-publisher/capture', {
        headers: { [captureClaimHeader]: claimToken },
      }),
      env(assetFetch)
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Referrer-Policy')).toBe('no-referrer');
    const assetRequest = assetFetch.mock.calls[0]?.[0];
    expect(assetRequest).toBeDefined();
    expect(new URL(assetRequest?.url ?? 'https://invalid.invalid').pathname).toBe(
      '/publisher-capture.html'
    );
    expect(assetRequest?.url).not.toContain(claimToken);
    expect(upstream).toHaveBeenCalledOnce();
  });

  test.each([
    '/publisher-capture.html',
    '/publisher-capture/entry-hash.js',
  ])('hides direct capture asset %s without an item claim', async (pathname) => {
    const assetFetch = vi.fn();
    const response = await handleCaptureRoute(
      new Request(`https://publisher.example.com${pathname}`),
      env(assetFetch)
    );
    expect(response?.status).toBe(404);
    expect(assetFetch).not.toHaveBeenCalled();
  });

  test('serves hashed capture assets only through the host item-claim cookie', async () => {
    const upstream = stubValidClaim();
    const assetFetch = vi.fn(async () => new Response('bundle'));
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/publisher-capture/entry-hash.js', {
        headers: { Cookie: `__Host-asset_item_claim=${claimToken}` },
      }),
      env(assetFetch)
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(assetFetch).toHaveBeenCalledOnce();
    expect(upstream).toHaveBeenCalledOnce();
  });

  test.each([
    ['arbitrary token', 'arbitrary-capability-000000001'],
    ['invalid signature', 'invalid-signature-00000000001'],
    ['expired capability', 'expired-capability-0000000001'],
    ['wrong claim or generation', 'wrong-claim-generation-0000001'],
  ])('%s cannot serve the capture shell, HTML, or bundle', async (_label, invalidToken) => {
    stubValidClaim();
    for (const pathname of [
      '/__asset-publisher/capture',
      '/publisher-capture.html',
      '/publisher-capture/entry-hash.js',
    ]) {
      const assetFetch = vi.fn();
      const response = await handleCaptureRoute(
        new Request(`https://publisher.example.com${pathname}`, {
          headers: {
            [captureClaimHeader]: invalidToken,
            Cookie: `__Host-asset_item_claim=${invalidToken}`,
          },
        }),
        env(assetFetch)
      );
      expect(response?.status, pathname).toBe(404);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(assetFetch).not.toHaveBeenCalled();
    }
  });

  test('proxies the exact item claim as a Convex bearer without slug or auth state', async () => {
    const upstream = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe(`Bearer ${claimToken}`);
      return Response.json({
        ok: true,
        payload: { factionId: 'faction', slug: 'ignored-by-routing', faction: {} },
        payloadHash: 'a'.repeat(64),
      });
    });
    vi.stubGlobal('fetch', upstream);
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/__asset-publisher/snapshot', {
        headers: { [captureClaimHeader]: claimToken },
      }),
      env()
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(upstream).toHaveBeenCalledOnce();
  });

  test('accepts the host-only item-claim cookie used by Browser Session', async () => {
    const upstream = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal('fetch', upstream);
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/__asset-publisher/snapshot', {
        headers: { Cookie: `__Host-asset_item_claim=${claimToken}` },
      }),
      env()
    );
    expect(response?.status).toBe(200);
    expect(upstream).toHaveBeenCalledOnce();
  });

  test('rejects oversized item claims before Convex fetch', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/__asset-publisher/snapshot', {
        headers: { [captureClaimHeader]: 'x'.repeat(257) },
      }),
      env()
    );
    expect(response?.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  test.each([
    ['headers', async () => await new Promise<Response>(() => {})],
    [
      'body',
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"ok":true'));
            },
          })
        ),
    ],
  ] as const)('bounds a never-resolving Convex %s', async (_phase, fetcher) => {
    vi.stubGlobal('fetch', fetcher);
    const response = await handleCaptureRoute(
      new Request('https://publisher.example.com/__asset-publisher/snapshot', {
        headers: {
          Cookie: `__Host-asset_item_claim=${claimToken}; __Host-asset_render_deadline=${Date.now() + 15}`,
        },
      }),
      env()
    );
    expect(response?.status).toBe(502);
  });
});
