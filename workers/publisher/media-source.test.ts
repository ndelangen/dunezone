import { createHash } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { MEDIA_SOURCE_MAX_BYTES, handleMediaSourceRequest, mediaSourceKey } from './media-source';
import type { MediaSourceBucket, MediaSourceEnv } from './media-source';
import { fakeR2Object, jpegBytes, pngBytes } from './test-helpers';

const ORIGIN = 'https://dune.zone';
const TOKEN = 'upload-token';
const NOW = new Date('2026-10-09T12:00:00.000Z');

type Stored = { bytes: Uint8Array; options: R2PutOptions };

function storedObject(key: string, entry: Stored): R2Object {
  const base = fakeR2Object({
    key,
    etag: `etag-${key.slice(7, 15)}`,
    size: entry.bytes.byteLength,
    uploaded: NOW,
    customMetadata: entry.options.customMetadata as Record<string, string>,
  });
  return {
    ...base,
    writeHttpMetadata: base.writeHttpMetadata,
    httpMetadata: entry.options.httpMetadata as R2HTTPMetadata,
  };
}

function memoryBucket(): MediaSourceBucket & { objects: Map<string, Stored>; puts: number } {
  const objects = new Map<string, Stored>();
  const bucket = {
    objects,
    puts: 0,
    async head(key: string) {
      const entry = objects.get(key);
      return entry ? storedObject(key, entry) : null;
    },
    async get(key: string) {
      const entry = objects.get(key);
      if (!entry) {
        return null;
      }
      return { ...storedObject(key, entry), body: new Response(entry.bytes).body! } as unknown as R2ObjectBody;
    },
    async put(key: string, value: unknown, options: R2PutOptions = {}) {
      bucket.puts += 1;
      const onlyIf = options.onlyIf as R2Conditional | undefined;
      if (onlyIf?.etagDoesNotMatch === '*' && objects.has(key)) {
        return null;
      }
      const entry = { bytes: value as Uint8Array, options };
      objects.set(key, entry);
      return storedObject(key, entry);
    },
  };
  return bucket as unknown as MediaSourceBucket & { objects: Map<string, Stored>; puts: number };
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function environment(overrides: Partial<MediaSourceEnv> = {}) {
  const bucket = memoryBucket();
  return { bucket, env: { MEDIA_SOURCE_BUCKET: bucket, MEDIA_UPLOAD_TOKEN: TOKEN, ...overrides } };
}

function upload(hash: string, body: Uint8Array, token: string | null = TOKEN): Request {
  const headers = new Headers();
  if (token !== null) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return new Request(`${ORIGIN}/__media/src/${hash}`, { method: 'PUT', body, headers });
}

describe('media source ingest', () => {
  test('stores a PNG once under its hash and returns a receipt', async () => {
    const { bucket, env } = environment();
    const bytes = pngBytes(640, 480);
    const hash = sha256(bytes);

    const response = await handleMediaSourceRequest(upload(hash, bytes), env);

    expect(response?.status).toBe(201);
    expect(await response?.json()).toEqual({
      sha256: hash,
      bytes: bytes.byteLength,
      width: 640,
      height: 480,
      format: 'png',
      created: true,
    });
    const stored = bucket.objects.get(mediaSourceKey(hash));
    expect(stored?.options.httpMetadata).toEqual({ contentType: 'image/png' });
    expect(stored?.options.sha256).toBe(hash);
  });

  test('answers an identical re-upload with 200 and leaves the object alone', async () => {
    const { bucket, env } = environment();
    const bytes = jpegBytes({ widthPx: 300, heightPx: 200, progressive: false });
    const hash = sha256(bytes);
    await handleMediaSourceRequest(upload(hash, bytes), env);

    const again = await handleMediaSourceRequest(upload(hash, bytes), env);

    expect(again?.status).toBe(200);
    expect(await again?.json()).toMatchObject({ format: 'jpeg', width: 300, height: 200, created: false });
    expect(bucket.objects.size).toBe(1);
  });

  test('refuses a stored object whose metadata disagrees, never overwriting it', async () => {
    const { bucket, env } = environment();
    const bytes = pngBytes(10, 10);
    const hash = sha256(bytes);
    bucket.objects.set(mediaSourceKey(hash), {
      bytes,
      options: { customMetadata: { sha256: 'f'.repeat(64), format: 'png', width: '10', height: '10' } },
    });

    const response = await handleMediaSourceRequest(upload(hash, bytes), env);

    expect(response?.status).toBe(409);
    expect(bucket.objects.get(mediaSourceKey(hash))?.options.customMetadata).toMatchObject({ sha256: 'f'.repeat(64) });
  });

  test('refuses a body that does not hash to the path', async () => {
    const { bucket, env } = environment();
    const response = await handleMediaSourceRequest(upload('a'.repeat(64), pngBytes(1, 1)), env);
    expect(response?.status).toBe(422);
    expect(bucket.puts).toBe(0);
  });

  test('refuses bytes that are neither PNG nor JPEG', async () => {
    const { env } = environment();
    const bytes = new TextEncoder().encode('<html>outage</html>');
    const response = await handleMediaSourceRequest(upload(sha256(bytes), bytes), env);
    expect(response?.status).toBe(415);
  });

  test('refuses a missing or wrong token, and refuses everything while no token is configured', async () => {
    const bytes = pngBytes(1, 1);
    const hash = sha256(bytes);
    const { env } = environment();
    expect((await handleMediaSourceRequest(upload(hash, bytes, null), env))?.status).toBe(401);
    expect((await handleMediaSourceRequest(upload(hash, bytes, 'wrong'), env))?.status).toBe(401);
    const unconfigured = environment({ MEDIA_UPLOAD_TOKEN: undefined });
    expect((await handleMediaSourceRequest(upload(hash, bytes), unconfigured.env))?.status).toBe(503);
  });

  test('refuses an empty body and an image with no area', async () => {
    const { env } = environment();
    const empty = new Uint8Array();
    expect((await handleMediaSourceRequest(upload(sha256(empty), empty), env))?.status).toBe(400);
    const flat = pngBytes(0, 4);
    expect((await handleMediaSourceRequest(upload(sha256(flat), flat), env))?.status).toBe(415);
  });

  test('refuses a body over the bound', async () => {
    const { bucket, env } = environment();
    const bytes = new Uint8Array(MEDIA_SOURCE_MAX_BYTES + 1);
    const response = await handleMediaSourceRequest(upload(sha256(bytes), bytes), env);
    expect(response?.status).toBe(413);
    expect(bucket.puts).toBe(0);
  });
});

describe('media source reads', () => {
  async function stored() {
    const { env } = environment();
    const bytes = pngBytes(4, 4);
    const hash = sha256(bytes);
    await handleMediaSourceRequest(upload(hash, bytes), env);
    return { env, bytes, hash, url: `${ORIGIN}/__media/src/${hash}` };
  }

  async function answer(request: Request, env: MediaSourceEnv): Promise<Response> {
    const response = await handleMediaSourceRequest(request, env);
    expect(response).not.toBeNull();
    return response as Response;
  }

  test('serves a stored original with its integrity headers', async () => {
    const { env, bytes, hash, url } = await stored();

    const response = await answer(new Request(url), env);

    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      'content-type': 'image/png',
      'x-media-sha256': hash,
      'x-media-bytes': String(bytes.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  test('answers HEAD without a body', async () => {
    const { env, url } = await stored();
    const head = await answer(new Request(url, { method: 'HEAD' }), env);
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
  });

  test('answers a matching ETag with 304', async () => {
    const { env, url } = await stored();
    const etag = (await answer(new Request(url), env)).headers.get('ETag');
    const revalidated = await answer(new Request(url, { headers: { 'If-None-Match': String(etag) } }), env);
    expect(revalidated.status).toBe(304);
  });

  test('answers 404 that is never cached for an unknown hash, a malformed path or the bare namespace, even on navigation', async () => {
    const { env } = environment();
    for (const path of [`/__media/src/${'b'.repeat(64)}`, '/__media/src/nothex', '/__media', '/__media/']) {
      const response = await handleMediaSourceRequest(
        new Request(`${ORIGIN}${path}`, { headers: { 'Sec-Fetch-Mode': 'navigate' } }),
        env
      );
      expect(response?.status, path).toBe(404);
      expect(response?.headers.get('Cache-Control'), path).toBe('no-store');
      expect(response?.headers.get('Content-Type'), path).toContain('application/json');
    }
  });

  test('leaves other paths alone and refuses other methods', async () => {
    const { env } = environment();
    expect(await handleMediaSourceRequest(new Request(`${ORIGIN}/__mediax`), env)).toBeNull();
    expect(await handleMediaSourceRequest(new Request(`${ORIGIN}/image/a.png`), env)).toBeNull();
    const deleted = await handleMediaSourceRequest(
      new Request(`${ORIGIN}/__media/src/${'c'.repeat(64)}`, { method: 'DELETE' }),
      env
    );
    expect(deleted?.status).toBe(405);
  });
});
