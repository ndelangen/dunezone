import { describe, expect, test } from 'vitest';

import { legacyVariant } from '../../src/shared/media/legacyVariant';
import { mediaVariantKey } from './media';
import { handleLegacyMediaRequest, mediaFetcher } from './media-legacy';
import { memoryR2Bucket } from './test-helpers';

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

async function answer(path: string, environment: ReturnType<typeof env>, init: RequestInit = {}) {
  const response = await handleLegacyMediaRequest(new Request(`${ORIGIN}${path}`, init), environment);
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
