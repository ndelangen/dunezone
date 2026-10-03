import { describe, expect, test, vi } from 'vitest';

import { socialCardHref } from '../../src/shared/socialCard';
import { handleApplicationRequest } from './application';
import { PUBLIC_CACHE_SECONDS, publicCacheKey } from './public-cache';
import type { PublicCache } from './public-cache';
import { handleSocialImageRequest } from './social-image';
import { fakeR2Object, jpegBytes, pngBytes } from './test-helpers';

/* Time and eviction are controlled at the cache seam, not by waiting for a platform TTL. */
function edgeCache() {
  let now = 0;
  const entries = new Map<string, { bytes: ArrayBuffer; init: ResponseInit; expires: number }>();
  const storage = {
    delete: vi.fn(async (request: Request) => entries.delete(request.url)),
    match: vi.fn(async (request: Request) => {
      const entry = entries.get(request.url);
      return entry && entry.expires > now ? new Response(entry.bytes, entry.init) : undefined;
    }),
    put: vi.fn(async (request: Request, response: Response) => {
      const seconds = Number(/max-age=(\d+)/.exec(response.headers.get('Cache-Control') ?? '')?.[1]);
      entries.set(request.url, {
        bytes: await response.arrayBuffer(),
        init: { status: response.status, headers: response.headers },
        expires: now + seconds,
      });
    }),
  };
  return {
    cache: { storage, release: 'a' } as PublicCache,
    storage,
    advance: (seconds: number) => {
      now += seconds;
    },
    evict: () => entries.clear(),
  };
}
const env = { CF_VERSION_METADATA: { id: 'a', tag: 'a', timestamp: 'now' }, GIT_SHA: 'development' } as const;
const page = 'https://dune.zone/factions/test-faction';
const artwork = '/published/faction-tokens/abcdefghijklmnop/token.jpg';
const image = socialCardHref({ name: 'Test faction', kind: 'Faction', description: '', image: artwork });
const req = (path = image, method = 'GET') => new Request(new URL(path, 'https://dune.zone'), { method });

function jpegObject(): R2ObjectBody {
  const bytes = jpegBytes({ widthPx: 600, heightPx: 600, progressive: true });
  const response = new Response(bytes);
  return {
    ...fakeR2Object({ etag: 'jpeg', size: bytes.byteLength, uploaded: new Date(0) }),
    writeHttpMetadata() {},
    body: response.body!,
    bodyUsed: false,
    arrayBuffer: () => response.arrayBuffer(),
    bytes: () => response.bytes(),
    text: () => response.text(),
    json: () => response.json(),
    blob: () => response.blob(),
  };
}

describe('public HTML edge cache', () => {
  test('credentials never reach rendering and both visitors reuse exactly the same public body', async () => {
    const { cache } = edgeCache();
    const render = vi.fn(async (request: Request) => {
      expect([...request.headers]).toEqual([['accept', 'text/html']]);
      return new Response('public', { headers: { 'X-Public-Metadata-Queries': '1' } });
    });
    const first = await handleApplicationRequest(
      new Request(page, { headers: { Cookie: 'session=secret', Authorization: 'Bearer secret' } }),
      env,
      render,
      cache
    );
    const second = await handleApplicationRequest(new Request(page), env, render, cache);
    expect(await first!.text()).toBe(await second!.text());
    expect(first!.headers.get('X-Public-Cache')).toBe('miss');
    expect(first!.headers.get('X-Public-Metadata-Queries')).toBe('1');
    expect(second!.headers.get('X-Public-Cache')).toBe('hit');
    expect(second!.headers.get('X-Public-Metadata-Queries')).toBe('0');
    expect(second!.headers.get('Cache-Control')).toBe('no-store');
    expect(render).toHaveBeenCalledTimes(1);
  });

  test('expiry, eviction, query normalization and release changes preserve correct generation', async () => {
    const edge = edgeCache();
    const render = vi.fn(async () => new Response(String(render.mock.calls.length)));
    const request = (query = '?q=hello&sort=updated') => new Request(page + query);
    const run = (query?: string) => handleApplicationRequest(request(query), env, render, edge.cache);
    expect(await (await run())!.text()).toBe('1');
    expect(await (await run('?sort=updated&q=hello'))!.text()).toBe('1');
    edge.advance(PUBLIC_CACHE_SECONDS.html);
    expect(await (await run())!.text()).toBe('2');
    edge.evict();
    expect(await (await run())!.text()).toBe('3');
    edge.cache.release = 'b';
    expect(await (await run())!.text()).toBe('4');
    expect(await (await run('?q=different&sort=updated'))!.text()).toBe('5');
    expect(await handleApplicationRequest(new Request(page + '/edit'), env, render, edge.cache)).toBeNull();
    expect(render).toHaveBeenCalledTimes(5);
  });

  test.each<ResponseInit>([
    { status: 404 },
    { status: 500 },
    { headers: { 'Set-Cookie': 'unexpected=secret' } },
    { headers: { 'Cache-Control': 'private' } },
    { headers: { 'Cache-Control': 'no-store' } },
    { headers: { Vary: 'Cookie' } },
  ])('does not store an ineligible response: %j', async (init) => {
    const edge = edgeCache();
    const render = vi.fn(async () => new Response('body', init));
    await handleApplicationRequest(new Request(page), env, render, edge.cache);
    const response = await handleApplicationRequest(new Request(page), env, render, edge.cache);
    expect(edge.storage.put).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(2);
    expect(response!.headers.get('Set-Cookie')).toBeNull();
  });

  test('cache outages still return the freshly rendered response', async () => {
    const edge = edgeCache();
    edge.storage.match.mockRejectedValue(new Error('cache unavailable'));
    edge.storage.put.mockRejectedValue(new Error('cache unavailable'));
    const response = await handleApplicationRequest(
      new Request(page),
      env,
      async () => new Response('fresh'),
      edge.cache
    );
    expect(await response!.text()).toBe('fresh');
    expect(response!.headers.get('X-Public-Cache')).toBe('error');
  });
});

describe('public PNG and artwork edge caches', () => {
  test('normalizes inputs, shares HEAD, expires and evicts without metadata calls', async () => {
    const edge = edgeCache();
    const get = vi.fn<R2Bucket['get']>().mockImplementation(async () => jpegObject());
    const render = vi.fn(async () => pngBytes(1200, 630));
    const run = (request = req()) => handleSocialImageRequest(request, { ASSET_BUCKET: { get } }, render, edge.cache);
    expect((await run())!.headers.get('X-Public-Cache')).toBe('miss');
    const reordered = new URL(req().url);
    reordered.searchParams.sort();
    const hit = await run(
      new Request(reordered, { method: 'HEAD', headers: { Cookie: 'private', Authorization: 'secret' } })
    );
    expect(hit!.headers.get('X-Public-Cache')).toBe('hit');
    expect(hit!.headers.get('X-Public-Artwork-Reads')).toBe('0');
    expect(hit!.headers.get('X-Public-Metadata-Queries')).toBe('0');
    expect(await hit!.text()).toBe('');
    expect(get).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    const changed = await run(req(image.replace('Test+faction', 'Changed')));
    expect(changed!.headers.get('X-Public-Artwork-Cache')).toBe('hit');
    expect(get).toHaveBeenCalledTimes(1);
    edge.advance(PUBLIC_CACHE_SECONDS.png);
    expect((await run())!.headers.get('X-Public-Cache')).toBe('miss');
    expect(get).toHaveBeenCalledTimes(2);
    edge.evict();
    expect((await run())!.headers.get('X-Public-Cache')).toBe('miss');
    expect(get).toHaveBeenCalledTimes(3);
  });

  test('missing art retries after five minutes and renderer failures are never cached', async () => {
    const edge = edgeCache();
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(null);
    const render = vi.fn(async () => pngBytes(1200, 630));
    const run = () => handleSocialImageRequest(req(), { ASSET_BUCKET: { get } }, render, edge.cache);
    expect((await run())!.headers.get('X-Public-Fallback')).toBe('true');
    await run();
    expect(get).toHaveBeenCalledTimes(1);
    edge.advance(PUBLIC_CACHE_SECONDS.fallback);
    get.mockImplementation(async () => jpegObject());
    expect((await run())!.headers.get('X-Public-Fallback')).toBe('false');
    expect(get).toHaveBeenCalledTimes(2);
    edge.evict();
    render.mockRejectedValue(new Error('broken'));
    expect((await run())!.status).toBe(503);
    expect((await run())!.status).toBe(503);
  });

  test('caught artwork failures discard bad cached bytes so fallback expiry can recover', async () => {
    const edge = edgeCache();
    const get = vi.fn<R2Bucket['get']>().mockImplementation(async () => jpegObject());
    let broken = true;
    const render = vi.fn(async (_input, artwork: ArrayBuffer | null) => {
      if (broken && artwork) {
        throw new Error('unreadable artwork');
      }
      return pngBytes(1200, 630);
    });
    const run = () => handleSocialImageRequest(req(), { ASSET_BUCKET: { get } }, render, edge.cache);
    expect((await run())!.headers.get('X-Public-Fallback')).toBe('true');
    expect(edge.storage.delete).toHaveBeenCalledTimes(1);
    broken = false;
    edge.advance(PUBLIC_CACHE_SECONDS.fallback);
    expect((await run())!.headers.get('X-Public-Fallback')).toBe('false');
    expect(get).toHaveBeenCalledTimes(2);
  });

  test('cache hits bypass the render rate limiter and rejected misses do no artwork work', async () => {
    const edge = edgeCache();
    const limit = vi.fn().mockResolvedValue({ success: true });
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(null);
    const render = vi.fn(async () => pngBytes(1200, 630));
    const run = () =>
      handleSocialImageRequest(
        req(),
        { ASSET_BUCKET: { get }, SOCIAL_RENDER_RATE_LIMIT: { limit } },
        render,
        edge.cache
      );
    expect((await run())!.status).toBe(200);
    limit.mockResolvedValue({ success: false });
    expect((await run())!.status).toBe(200);
    expect(limit).toHaveBeenCalledTimes(1);
    edge.evict();
    expect((await run())!.status).toBe(429);
    expect(get).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
  });

  test('two active renders are allowed and excess misses get a retryable response without queuing', async () => {
    let finish!: (value: Uint8Array) => void;
    const pending = new Promise<Uint8Array>((resolve) => {
      finish = resolve;
    });
    const render = vi.fn(() => pending);
    const get = vi.fn<R2Bucket['get']>().mockResolvedValue(null);
    const run = () => handleSocialImageRequest(req(), { ASSET_BUCKET: { get } }, render);
    const first = run();
    const second = run();
    expect((await run())!.status).toBe(503);
    finish(pngBytes(1200, 630));
    expect((await first)!.status).toBe(200);
    expect((await second)!.status).toBe(200);
    expect(render).toHaveBeenCalledTimes(2);
  });

  test('keys separate releases and response types without containing supplied text', async () => {
    const { cache } = edgeCache();
    const url = new URL(req().url);
    const png = await publicCacheKey(url, cache, 'png');
    expect(png.url).not.toContain('Test');
    expect(png.url).not.toBe((await publicCacheKey(url, cache, 'html')).url);
    expect(png.url).not.toBe((await publicCacheKey(url, { ...cache, release: 'b' }, 'png')).url);
  });
});
