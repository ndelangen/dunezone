import { afterEach, describe, expect, test, vi } from 'vitest';

import { USER_IMAGE_INGEST_PATH } from '../../src/shared/user-images/contract';
import { fakeR2Object, jpegBytes, pngBytes } from './test-helpers';
import { handleUserImageIngest, handleUserImageRequest } from './user-images';
import type { UserImageBucket, UserImageCache } from './user-images';

const NOW = new Date('2026-08-25T12:00:00.000Z');
const SECRET = 'user-image-ingest-secret-for-tests-0001';
const SOURCE_URL = 'https://images.example/cover.png';

type StoredEntry = { bytes: Uint8Array; options: R2PutOptions };

function memoryBucket(): UserImageBucket & { objects: Map<string, StoredEntry> } {
  const objects = new Map<string, StoredEntry>();
  return {
    objects,
    async get(key) {
      const entry = objects.get(key);
      if (!entry) {
        return null;
      }
      const body = new Response(entry.bytes).body;
      if (!body) {
        throw new Error('missing test stream');
      }
      const base = fakeR2Object({ key, etag: `etag-${key.slice(0, 8)}`, size: entry.bytes.byteLength, uploaded: NOW });
      return {
        ...base,
        body,
        bodyUsed: false,
        arrayBuffer: async () => entry.bytes.buffer as ArrayBuffer,
        bytes: async () => entry.bytes,
        text: async () => '',
        json: async () => ({}),
        blob: async () => new Blob([entry.bytes]),
      };
    },
    async put(key, value, options) {
      objects.set(key, { bytes: value, options });
      return fakeR2Object({ key, etag: `etag-${key.slice(0, 8)}`, size: value.byteLength, uploaded: NOW });
    },
  };
}

function emptyCache(): UserImageCache & { stored: Map<string, Response> } {
  const stored = new Map<string, Response>();
  return {
    stored,
    async match(request) {
      return stored.get(request.url)?.clone();
    },
    async put(request, response) {
      stored.set(request.url, response);
    },
  };
}

function pendingContext(): Pick<ExecutionContext, 'waitUntil'> & { pending: Promise<unknown>[] } {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    },
  };
}

type ImagesStubSeen = { transforms: unknown[]; outputs: unknown[] };

/** The chained fragment of the Images binding the handler touches, recording each request and dealing encodes from a queue, one per rendition. */
function imagesStub(encodedQueue: Uint8Array[], seen: ImagesStubSeen = { transforms: [], outputs: [] }): ImagesBinding {
  const transformer = {
    transform(options: unknown) {
      seen.transforms.push(options);
      return transformer;
    },
    async output(options: unknown) {
      seen.outputs.push(options);
      const encoded = encodedQueue.shift();
      if (!encoded) {
        throw new Error('imagesStub queue is empty');
      }
      return {
        image: () => new Response(encoded).body,
        contentType: () => 'image/jpeg',
      };
    },
  };
  return { input: () => transformer } as unknown as ImagesBinding;
}

function ingestRequest(options: { body?: string; token?: string; origin?: string } = {}): Request {
  return new Request(`${options.origin ?? 'https://dune.zone'}${USER_IMAGE_INGEST_PATH}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token ?? SECRET}`,
      'Content-Type': 'application/json',
    },
    body: options.body ?? JSON.stringify({ source_url: SOURCE_URL }),
  });
}

function sourceResponse(bytes: Uint8Array, headers: Record<string, string> = {}): Response {
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', ...headers } });
}

/** Reads the `error` field a refusal carries, failing plainly when the response or the field is missing. */
async function refusalMessage(response: Response | null): Promise<string> {
  if (!response) {
    throw new Error('expected a response');
  }
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) {
    throw new Error('expected a refusal body');
  }
  return String(payload.error);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('user image ingest', () => {
  test('stores both renditions under their content hashes and answers with the delivery URLs', async () => {
    const fetchMock = vi.fn(async () => sourceResponse(pngBytes(800, 600)));
    vi.stubGlobal('fetch', fetchMock);
    const bucket = memoryBucket();
    const seen: ImagesStubSeen = { transforms: [], outputs: [] };
    const fullEncoded = jpegBytes({ widthPx: 800, heightPx: 600, progressive: true });
    const thumbEncoded = jpegBytes({ widthPx: 320, heightPx: 240, progressive: true });

    const response = await handleUserImageIngest(ingestRequest(), {
      USER_IMAGE_BUCKET: bucket,
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([fullEncoded, thumbEncoded], seen),
    });

    expect(response?.status).toBe(200);
    if (!response) {
      throw new Error('expected a response');
    }
    const payload = (await response.json()) as {
      url: string;
      key: string;
      thumb_url: string;
      thumb_key: string;
      width: number;
      height: number;
    };
    expect(payload.key).toMatch(/^[0-9a-f]{64}\.jpg$/);
    expect(payload.url).toBe(`https://dune.zone/user-images/${payload.key}`);
    expect(payload.thumb_key).toMatch(/^[0-9a-f]{64}\.jpg$/);
    expect(payload.thumb_key).not.toBe(payload.key);
    expect(payload.thumb_url).toBe(`https://dune.zone/user-images/${payload.thumb_key}`);
    expect(payload.width).toBe(800);
    expect(payload.height).toBe(600);
    expect(seen.transforms).toEqual([
      { width: 1600, height: 1600, fit: 'scale-down' },
      { width: 320, height: 320, fit: 'scale-down' },
    ]);
    expect(seen.outputs).toMatchObject([{ format: 'image/jpeg' }, { format: 'image/jpeg' }]);
    expect(bucket.objects.size).toBe(2);
    const stored = bucket.objects.get(payload.key);
    expect(stored?.options.httpMetadata).toMatchObject({ contentType: 'image/jpeg' });
    expect(stored?.options.customMetadata).toMatchObject({ sourceUrl: SOURCE_URL });
    const storedThumb = bucket.objects.get(payload.thumb_key);
    expect(storedThumb?.options.customMetadata).toMatchObject({ sourceUrl: SOURCE_URL });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('tolerates a baseline thumb when the thumb box squeezes one edge under the progressive floor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sourceResponse(pngBytes(1600, 60)))
    );
    const response = await handleUserImageIngest(ingestRequest(), {
      USER_IMAGE_BUCKET: memoryBucket(),
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([
        jpegBytes({ widthPx: 1600, heightPx: 60, progressive: true }),
        jpegBytes({ widthPx: 320, heightPx: 12, progressive: false }),
      ]),
    });
    expect(response?.status).toBe(200);
  });

  test('mints the delivery URL on the pinned public origin even when ingest arrives on another hostname', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sourceResponse(pngBytes(800, 600)))
    );
    const response = await handleUserImageIngest(
      ingestRequest({ origin: 'https://faction-sheet-asset-publisher.ndelangen.workers.dev' }),
      {
        USER_IMAGE_BUCKET: memoryBucket(),
        USER_IMAGE_INGEST_SECRET: SECRET,
        USER_IMAGE_PUBLIC_BASE_URL: 'https://dune.zone',
        IMAGES: imagesStub([
          jpegBytes({ widthPx: 800, heightPx: 600, progressive: true }),
          jpegBytes({ widthPx: 320, heightPx: 240, progressive: true }),
        ]),
      }
    );
    expect(response?.status).toBe(200);
    if (!response) {
      throw new Error('expected a response');
    }
    const payload = (await response.json()) as { url: string; key: string; thumb_url: string; thumb_key: string };
    expect(payload.url).toBe(`https://dune.zone/user-images/${payload.key}`);
    expect(payload.thumb_url).toBe(`https://dune.zone/user-images/${payload.thumb_key}`);
  });

  test('refuses a wrong bearer token without fetching anything', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleUserImageIngest(ingestRequest({ token: 'wrong' }), {
      USER_IMAGE_BUCKET: memoryBucket(),
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([jpegBytes({ widthPx: 80, heightPx: 80, progressive: true })]),
    });
    expect(response?.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('refuses a non-https source before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleUserImageIngest(
      ingestRequest({ body: JSON.stringify({ source_url: 'http://images.example/cover.png' }) }),
      {
        USER_IMAGE_BUCKET: memoryBucket(),
        USER_IMAGE_INGEST_SECRET: SECRET,
        IMAGES: imagesStub([jpegBytes({ widthPx: 80, heightPx: 80, progressive: true })]),
      }
    );
    expect(response?.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('refuses a redirect that leaves https', async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { Location: 'http://images.example/cover.png' } })
    );
    vi.stubGlobal('fetch', fetchMock);
    const response = await handleUserImageIngest(ingestRequest(), {
      USER_IMAGE_BUCKET: memoryBucket(),
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([jpegBytes({ widthPx: 80, heightPx: 80, progressive: true })]),
    });
    expect(response?.status).toBe(422);
    expect(await refusalMessage(response)).toContain('https');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('refuses a response that is not an image', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }))
    );
    const response = await handleUserImageIngest(ingestRequest(), {
      USER_IMAGE_BUCKET: memoryBucket(),
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([jpegBytes({ widthPx: 80, heightPx: 80, progressive: true })]),
    });
    expect(response?.status).toBe(422);
    expect(await refusalMessage(response)).toBe('The URL did not return an image');
  });

  test('refuses a source larger than the byte limit even without a Content-Length header', async () => {
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sourceResponse(oversized))
    );
    const response = await handleUserImageIngest(ingestRequest(), {
      USER_IMAGE_BUCKET: memoryBucket(),
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([jpegBytes({ widthPx: 80, heightPx: 80, progressive: true })]),
    });
    expect(response?.status).toBe(422);
    expect(await refusalMessage(response)).toContain('10 MB');
  });

  test('refuses an image smaller than the minimum edge', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sourceResponse(pngBytes(32, 32)))
    );
    const response = await handleUserImageIngest(ingestRequest(), {
      USER_IMAGE_BUCKET: memoryBucket(),
      USER_IMAGE_INGEST_SECRET: SECRET,
      IMAGES: imagesStub([jpegBytes({ widthPx: 32, heightPx: 32, progressive: true })]),
    });
    expect(response?.status).toBe(422);
    expect(await refusalMessage(response)).toContain('50px');
  });

  test('fails loudly when the encoder falls back to baseline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sourceResponse(pngBytes(800, 600)))
    );
    await expect(
      handleUserImageIngest(ingestRequest(), {
        USER_IMAGE_BUCKET: memoryBucket(),
        USER_IMAGE_INGEST_SECRET: SECRET,
        IMAGES: imagesStub([jpegBytes({ widthPx: 800, heightPx: 600, progressive: false })]),
      })
    ).rejects.toThrow('not progressive');
  });
});

describe('user image delivery', () => {
  const KEY = `${'a'.repeat(64)}.jpg`;

  async function storedBucket(): Promise<ReturnType<typeof memoryBucket>> {
    const bucket = memoryBucket();
    await bucket.put(KEY, jpegBytes({ widthPx: 800, heightPx: 600, progressive: true }), {
      httpMetadata: { contentType: 'image/jpeg' },
    });
    return bucket;
  }

  function deliveryRequest(path: string, headers: Record<string, string> = {}): Request {
    return new Request(`https://dune.zone${path}`, { headers });
  }

  test('serves a stored image immutable with nosniff and fills the edge cache', async () => {
    const bucket = await storedBucket();
    const cache = emptyCache();
    const ctx = pendingContext();
    const response = await handleUserImageRequest(
      deliveryRequest(`/user-images/${KEY}`),
      { USER_IMAGE_BUCKET: bucket },
      ctx,
      {
        cache,
      }
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response?.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response?.headers.get('ETag')).toBeTruthy();
    await response?.arrayBuffer();
    await Promise.all(ctx.pending);
    expect(cache.stored.size).toBe(1);
  });

  test('answers 304 to a matching If-None-Match', async () => {
    const bucket = await storedBucket();
    const first = await handleUserImageRequest(
      deliveryRequest(`/user-images/${KEY}`),
      { USER_IMAGE_BUCKET: bucket },
      pendingContext(),
      { cache: emptyCache() }
    );
    const etag = first?.headers.get('ETag') ?? '';
    await first?.arrayBuffer();
    const second = await handleUserImageRequest(
      deliveryRequest(`/user-images/${KEY}`, { 'If-None-Match': etag }),
      { USER_IMAGE_BUCKET: bucket },
      pendingContext(),
      { cache: emptyCache() }
    );
    expect(second?.status).toBe(304);
  });

  test('answers 404 inside the namespace for a missing or malformed key and leaves other paths alone', async () => {
    const bucket = await storedBucket();
    const missing = await handleUserImageRequest(
      deliveryRequest(`/user-images/${'b'.repeat(64)}.jpg`),
      { USER_IMAGE_BUCKET: bucket },
      pendingContext(),
      { cache: emptyCache() }
    );
    expect(missing?.status).toBe(404);
    const malformed = await handleUserImageRequest(
      deliveryRequest('/user-images/notahash.jpg'),
      { USER_IMAGE_BUCKET: bucket },
      pendingContext(),
      { cache: emptyCache() }
    );
    expect(malformed?.status).toBe(404);
    const outside = await handleUserImageRequest(
      deliveryRequest('/published/factions/x/sheet.pdf'),
      { USER_IMAGE_BUCKET: bucket },
      pendingContext(),
      { cache: emptyCache() }
    );
    expect(outside).toBeNull();
  });
});
