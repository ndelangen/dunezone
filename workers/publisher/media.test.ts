import { createHash } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { MEDIA_VARIANT_MAX_BYTES, handleMediaVariantRequest, mediaVariantKey } from './media';
import type { MediaVariantEnv } from './media';
import { memoryR2Bucket, pngBytes } from './test-helpers';

const ORIGIN = 'https://dune.zone';
const NAME = '0123456789abcdef0123.abcdef0123.webp';
const BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const SHA256 = 'f'.repeat(64);

const TOKEN = 'publish-token';

function empty() {
  return { MEDIA_BUCKET: memoryR2Bucket(), MEDIA_PUBLISH_TOKEN: TOKEN };
}

function stored(metadata: Record<string, string> = { sha256: SHA256, bytes: String(BYTES.byteLength) }) {
  const env = empty();
  env.MEDIA_BUCKET.objects.set(mediaVariantKey(NAME), { bytes: BYTES, options: { customMetadata: metadata } });
  return env;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function publish(body: Uint8Array, token: string | null = TOKEN): RequestInit {
  return { method: 'PUT', body, headers: token === null ? {} : { Authorization: `Bearer ${token}` } };
}

async function answer(path: string, init: RequestInit = {}, env: MediaVariantEnv = stored()): Promise<Response> {
  const response = await handleMediaVariantRequest(new Request(`${ORIGIN}${path}`, init), env);
  if (!response) {
    throw new Error(`${path} was not answered`);
  }
  return response;
}

describe('media variants', () => {
  test('serves a stored variant immutably with its integrity headers', async () => {
    const response = await answer(`/m/${NAME}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Media-SHA256')).toBe(SHA256);
    expect(response.headers.get('X-Media-Bytes')).toBe(String(BYTES.byteLength));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
  });

  test('answers HEAD without a body and a matching ETag with 304', async () => {
    const head = await answer(`/m/${NAME}`, { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(await head.text()).toBe('');

    const revalidated = await answer(`/m/${NAME}`, { headers: { 'If-None-Match': head.headers.get('ETag')! } });
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test.each([
    '/m',
    '/m/',
    `/m/${NAME.toUpperCase()}`,
    '/m/0123456789abcdef0123.abcdef0123.gif',
    `/m/v/${NAME}`,
    '/m/ffffffffffffffffffff.ffffffffff.png',
  ])('answers %s with an uncacheable JSON 404, even on navigation', async (path) => {
    const response = await answer(path, { headers: { 'Sec-Fetch-Mode': 'navigate' } });

    expect(response.status).toBe(404);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('refuses a variant stored without integrity metadata rather than serving it unverifiable', async () => {
    const response = await answer(`/m/${NAME}`, {}, stored({}));

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  test('leaves other paths alone and refuses other methods', async () => {
    expect((await answer(`/m/${NAME}`, { method: 'DELETE' })).status).toBe(405);
    expect(await handleMediaVariantRequest(new Request(`${ORIGIN}/media/${NAME}`), stored())).toBeNull();
    expect(await handleMediaVariantRequest(new Request(`${ORIGIN}/maps`), stored())).toBeNull();
  });
});

describe('media variant publishing', () => {
  const PNG_NAME = '0123456789abcdef0123.abcdef0123.png';
  const png = pngBytes(64, 32);

  test('stores a new variant once with its integrity metadata, then serves it', async () => {
    const env = empty();

    const created = await answer(`/m/${PNG_NAME}`, publish(png), env);
    expect(created.status).toBe(201);
    expect(await created.json()).toEqual({ name: PNG_NAME, sha256: sha256(png), bytes: png.byteLength, created: true });
    expect(env.MEDIA_BUCKET.objects.get(mediaVariantKey(PNG_NAME))?.options.customMetadata).toEqual({
      sha256: sha256(png),
      bytes: String(png.byteLength),
    });

    const served = await answer(`/m/${PNG_NAME}`, {}, env);
    expect(served.headers.get('X-Media-SHA256')).toBe(sha256(png));
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(png);
  });

  test('answers an identical re-publish with 200 and a different body with 409, never overwriting', async () => {
    const env = empty();
    await answer(`/m/${PNG_NAME}`, publish(png), env);

    const again = await answer(`/m/${PNG_NAME}`, publish(png), env);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { created: boolean }).created).toBe(false);

    const other = pngBytes(65, 32);
    const conflict = await answer(`/m/${PNG_NAME}`, publish(other), env);
    expect(conflict.status).toBe(409);
    expect(env.MEDIA_BUCKET.objects.get(mediaVariantKey(PNG_NAME))?.bytes).toEqual(png);
  });

  test.each([
    ['no token', publish(png, null), 401],
    ['a wrong token', publish(png, 'wrong'), 401],
    ['an empty body', publish(new Uint8Array()), 400],
    [
      'a PNG whose signature stops after four bytes',
      publish(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])),
      415,
    ],
    ['a JPEG under a .png name', publish(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 415],
    ['a body past the bound', publish(new Uint8Array(MEDIA_VARIANT_MAX_BYTES + 1)), 413],
  ])('refuses %s without storing anything', async (_case, init, status) => {
    const env = empty();

    expect((await answer(`/m/${PNG_NAME}`, init, env)).status).toBe(status);
    expect(env.MEDIA_BUCKET.objects.size).toBe(0);
  });

  test('refuses to publish while the token is unset', async () => {
    const env = { MEDIA_BUCKET: memoryR2Bucket() };

    expect((await answer(`/m/${PNG_NAME}`, publish(png), env)).status).toBe(503);
  });

  test('checks each extension against its own signature', async () => {
    const env = empty();
    const webp = new Uint8Array([...new TextEncoder().encode('RIFF'), 0, 0, 0, 0, ...new TextEncoder().encode('WEBP')]);
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 1, 2]);

    expect((await answer(`/m/${NAME}`, publish(webp), env)).status).toBe(201);
    expect((await answer('/m/0123456789abcdef0123.abcdef0123.jpg', publish(jpeg), env)).status).toBe(201);
    expect((await answer('/m/0123456789abcdef0124.abcdef0123.webp', publish(jpeg), env)).status).toBe(415);
  });
});
