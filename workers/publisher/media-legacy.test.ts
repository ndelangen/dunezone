import { describe, expect, test } from 'vitest';

import { legacyVariant } from '../../src/shared/media/legacyVariant';
import { mediaVariantKey } from './media';
import { handleLegacyMediaRequest, mediaFetcher } from './media-legacy';
import { memoryCache, memoryR2Bucket } from './test-helpers';

const ORIGIN = 'https://dune.zone';
const TIER_URL = '/image/texture/021-small.jpg';
const CANONICAL_URL = '/image/texture/021.jpg';
const SHA256 = 'e'.repeat(64);

/** Distinct bytes per URL, so a handler that serves the wrong variant fails. */
function bytesFor(url: string): Uint8Array {
  return new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode(url)]);
}

/** A static binding that answers listed paths, and the SPA's HTML for everything else. */
function assets(files: Record<string, string> = {}) {
  const requested: string[] = [];
  return {
    requested,
    async fetch(input: RequestInfo | URL) {
      const { pathname } = new URL(input instanceof Request ? input.url : input);
      requested.push(pathname);
      const type = files[pathname];
      return type
        ? new Response('static', { headers: { 'Content-Type': type } })
        : new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    },
  };
}

function env(published: string[] = [], files: Record<string, string> = {}) {
  const bucket = memoryR2Bucket();
  for (const url of published) {
    const bytes = bytesFor(url);
    bucket.objects.set(mediaVariantKey(legacyVariant(url)!), {
      bytes,
      options: { customMetadata: { sha256: SHA256, bytes: String(bytes.byteLength) } },
    });
  }
  return { MEDIA_BUCKET: bucket, ASSETS: assets(files) };
}

async function answer(path: string, environment: ReturnType<typeof env>, init: RequestInit = {}, serving = {}) {
  const response = await handleLegacyMediaRequest(new Request(`${ORIGIN}${path}`, init), environment, serving);
  if (!response) {
    throw new Error(`${path} was not answered`);
  }
  return response;
}

describe('legacy media URLs', () => {
  test('serve a locked tier from its published variant for an hour, with integrity headers', async () => {
    const environment = env([TIER_URL, CANONICAL_URL]);

    const response = await answer(TIER_URL, environment);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(response.headers.get('X-Media-SHA256')).toBe(SHA256);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytesFor(TIER_URL));
    expect(environment.ASSETS.requested).toEqual([]);
  });

  test('keep an answer from R2 at the edge for its hour, and leave static files to the edge itself', async () => {
    const cache = memoryCache();
    const environment = env([TIER_URL], { '/web/logo.svg': 'image/svg+xml' });

    const first = await answer(TIER_URL, environment, {}, cache.serving);
    expect(new Uint8Array(await first.arrayBuffer())).toEqual(bytesFor(TIER_URL));
    await answer('/web/logo.svg', environment, {}, cache.serving);
    await cache.settle();
    expect([...cache.stored.keys()]).toEqual([`${ORIGIN}${TIER_URL}`]);

    environment.MEDIA_BUCKET.objects.clear();
    const again = await answer(TIER_URL, environment, {}, cache.serving);
    expect(again.status).toBe(200);
    expect(again.headers.get('Cache-Control')).toBe('public, max-age=3600');
    expect(again.headers.get('X-Media-SHA256')).toBe(SHA256);
    expect(new Uint8Array(await again.arrayBuffer())).toEqual(bytesFor(TIER_URL));
    expect(environment.ASSETS.requested).toEqual(['/web/logo.svg']);
  });

  test('serve a canonical URL from the capped re-encode', async () => {
    const response = await answer(CANONICAL_URL, env([TIER_URL, CANONICAL_URL]));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytesFor(CANONICAL_URL));
  });

  test('refuse a stored variant without integrity metadata rather than fall back', async () => {
    const environment = env([], { [TIER_URL]: 'image/jpeg' });
    environment.MEDIA_BUCKET.objects.set(mediaVariantKey(legacyVariant(TIER_URL)!), {
      bytes: bytesFor(TIER_URL),
      options: {},
    });

    const response = await answer(TIER_URL, environment);

    expect(response.status).toBe(502);
    expect(environment.ASSETS.requested).toEqual([]);
  });

  test('fall back to the static file while the variant is unpublished', async () => {
    const environment = env([], { [TIER_URL]: 'image/jpeg' });

    const response = await answer(TIER_URL, environment);

    expect(await response.text()).toBe('static');
    expect(environment.ASSETS.requested).toEqual([TIER_URL]);
  });

  test('serve bundled images and illustrations when the bucket read fails', async () => {
    const environment = env([], { [TIER_URL]: 'image/jpeg', [CANONICAL_URL]: 'image/jpeg' });
    environment.MEDIA_BUCKET.get = async () => {
      throw new Error('Storage unavailable');
    };

    const response = await answer(TIER_URL, environment);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await response.text()).toBe('static');

    const illustration = await mediaFetcher(environment).fetch(`${ORIGIN}${CANONICAL_URL}`);
    expect(illustration.status).toBe(200);
    expect(illustration.headers.get('Content-Type')).toBe('image/jpeg');
    expect(await illustration.text()).toBe('static');
  });

  test('report a bucket outage as temporary when no bundled image exists, without caching it', async () => {
    const environment = env();
    environment.MEDIA_BUCKET.get = async () => {
      throw new Error('Storage unavailable');
    };
    const cache = memoryCache();

    const response = await answer(TIER_URL, environment, {}, cache.serving);

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
    await cache.settle();
    expect(cache.stored.size).toBe(0);
  });

  test('preserve static revalidation during a bucket outage', async () => {
    const environment = env();
    environment.MEDIA_BUCKET.get = async () => {
      throw new Error('Storage unavailable');
    };
    environment.ASSETS.fetch = async () => new Response(null, { status: 304, headers: { ETag: '"static"' } });

    const response = await answer(TIER_URL, environment, { headers: { 'If-None-Match': '"static"' } });

    expect(response.status).toBe(304);
    expect(response.headers.get('ETag')).toBe('"static"');
    expect(await response.text()).toBe('');
  });

  test('pass committed files through and refuse the SPA fallback as a 404', async () => {
    const environment = env([], { '/web/logo.svg': 'image/svg+xml' });

    expect(await (await answer('/web/logo.svg', environment)).text()).toBe('static');
    expect((await answer('/image', environment)).status).toBe(404);
    expect((await answer('/web/missing.png', environment)).status).toBe(404);
  });

  test('refuse writes and leave other paths alone', async () => {
    expect((await answer(TIER_URL, env(), { method: 'PUT' })).status).toBe(405);
    expect(await handleLegacyMediaRequest(new Request(`${ORIGIN}/imagery`), env())).toBeNull();
  });

  test('back the illustration fetcher, which reaches static files for everything else', async () => {
    const environment = env([CANONICAL_URL]);
    const fetcher = mediaFetcher(environment);

    const illustration = await fetcher.fetch(new Request(`https://rulebook-static.invalid${CANONICAL_URL}`));
    expect(illustration.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await illustration.arrayBuffer())).toEqual(bytesFor(CANONICAL_URL));
    expect(await (await fetcher.fetch(new Request(`https://rulebook-static.invalid/vector/x.svg`))).text()).toBe(
      '<!doctype html>'
    );
  });
});
