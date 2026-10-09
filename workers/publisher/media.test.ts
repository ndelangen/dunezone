import { describe, expect, test } from 'vitest';

import { handleMediaVariantRequest, mediaVariantKey } from './media';
import type { MediaVariantBucket } from './media';
import { fakeR2Object } from './test-helpers';

const ORIGIN = 'https://dune.zone';
const NAME = '0123456789abcdef0123.abcdef0123.webp';
const BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);
const SHA256 = 'f'.repeat(64);

type Entry = { bytes: Uint8Array; metadata: Record<string, string> };

function bucket(objects: Record<string, Entry>): MediaVariantBucket {
  return {
    async get(key: string) {
      const entry = objects[key];
      if (!entry) {
        return null;
      }
      const base = fakeR2Object({
        key,
        etag: 'variant-etag',
        size: entry.bytes.byteLength,
        uploaded: new Date('2026-10-09T12:00:00.000Z'),
        customMetadata: entry.metadata,
      });
      return { ...base, body: new Response(entry.bytes).body! } as unknown as R2ObjectBody;
    },
  } as MediaVariantBucket;
}

function stored(metadata: Record<string, string> = { sha256: SHA256, bytes: String(BYTES.byteLength) }) {
  return { MEDIA_BUCKET: bucket({ [mediaVariantKey(NAME)]: { bytes: BYTES, metadata } }) };
}

async function answer(path: string, init: RequestInit = {}, env = stored()): Promise<Response> {
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

  test('refuses writes and leaves other paths alone', async () => {
    expect((await answer(`/m/${NAME}`, { method: 'PUT', body: BYTES })).status).toBe(405);
    expect(await handleMediaVariantRequest(new Request(`${ORIGIN}/media/${NAME}`), stored())).toBeNull();
    expect(await handleMediaVariantRequest(new Request(`${ORIGIN}/maps`), stored())).toBeNull();
  });
});
