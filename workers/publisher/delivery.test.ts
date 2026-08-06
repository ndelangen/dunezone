import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret, createCacheToken } from '../../convex/lib/publicationHttp';
import { factionSheetPublicPath, handlePublicAssetRequest } from './delivery';
import type { PublicAssetBucket, PublicAssetCache } from './delivery';
import { PUBLISHER_CACHE_TOKEN_METADATA_KEY } from './r2';
import { fakeR2Object } from './test-helpers';

const FACTION_ID = 'j57c8t9m2q4w6e8r0y2u4i6o8p0a2s4d';
const SECRET = createCacheSigningSecret();
const NOW = new Date('2026-07-17T12:00:00.000Z');

type PendingContext = Pick<ExecutionContext, 'waitUntil'> & { pending: Promise<unknown>[] };

function context(): PendingContext {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    waitUntil(promise) {
      pending.push(promise);
    },
  };
}

function bodyObject(
  bytes: Uint8Array,
  options: { etag?: string; range?: R2Range; size?: number; token?: string } = {}
): R2ObjectBody {
  const body = new Response(bytes).body;
  if (!body) {
    throw new Error('missing test stream');
  }
  const base = fakeR2Object({
    key: `factions/${FACTION_ID}/sheet.pdf`,
    etag: options.etag ?? 'etag-one',
    size: options.size ?? (options.range ? 10 : bytes.byteLength),
    uploaded: NOW,
    customMetadata: options.token
      ? { [PUBLISHER_CACHE_TOKEN_METADATA_KEY]: options.token }
      : undefined,
  });
  return {
    ...base,
    range: options.range,
    body,
    bodyUsed: false,
    arrayBuffer: async () => Uint8Array.from(bytes).buffer,
    bytes: async () => bytes,
    text: async () => new TextDecoder().decode(bytes),
    json: async <T>() => JSON.parse(new TextDecoder().decode(bytes)) as T,
    blob: async () => new Blob([bytes]),
    writeHttpMetadata(headers) {
      headers.set('Content-Type', 'application/octet-stream');
      headers.set('Content-Disposition', 'attachment; filename="wrong.bin"');
    },
  } satisfies R2ObjectBody;
}

function metadataObject(options: { etag?: string; token?: string } = {}): R2Object {
  return fakeR2Object({
    key: `factions/${FACTION_ID}/sheet.pdf`,
    etag: options.etag ?? 'etag-one',
    size: 10,
    uploaded: NOW,
    customMetadata: options.token
      ? { [PUBLISHER_CACHE_TOKEN_METADATA_KEY]: options.token }
      : undefined,
  });
}

function cache() {
  const entries = new Map<string, Response>();
  const match = vi.fn(async (request: Request) => entries.get(request.url));
  const put = vi.fn(async (request: Request, response: Response) => {
    const bytes = await response.arrayBuffer();
    entries.set(
      request.url,
      new Response(bytes, { status: response.status, headers: new Headers(response.headers) })
    );
  });
  return { entries, match, put, value: { match, put } satisfies PublicAssetCache };
}

function env(bucket: PublicAssetBucket) {
  return {
    ASSET_BUCKET: bucket,
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: SECRET,
  } as Pick<Env, 'ASSET_BUCKET' | 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET'>;
}

function request(token?: string, init?: RequestInit): Request {
  const path = factionSheetPublicPath(FACTION_ID);
  const query = token === undefined ? '' : `?v=${encodeURIComponent(token)}`;
  return new Request(`https://assets.example.com${path}${query}`, init);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('public faction-sheet delivery', () => {
  test('requires exactly one valid cache token before Cache API or R2', async () => {
    const get = vi.fn();
    const head = vi.fn();
    const cacheState = cache();

    const response = await handlePublicAssetRequest(
      request(),
      env({ get, head } as PublicAssetBucket),
      context(),
      { cache: cacheState.value }
    );

    expect(response?.status).toBe(404);
    expect(cacheState.match).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  test('keeps an existing signed link working while stable R2 bytes are replaced', async () => {
    const oldToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const newToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const bucket: PublicAssetBucket = {
      head: async () => metadataObject({ token: newToken }),
      get: async () => bodyObject(new Uint8Array([1, 2, 3]), { token: newToken }),
    };

    const response = await handlePublicAssetRequest(request(oldToken), env(bucket), context(), {
      cache: cache().value,
    });

    expect(response?.status).toBe(200);
  });

  test('serves a legacy object without token metadata when the cache token is valid', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const bucket: PublicAssetBucket = {
      head: async () => metadataObject(),
      get: async () => bodyObject(new Uint8Array([1, 2, 3])),
    };

    const response = await handlePublicAssetRequest(request(token), env(bucket), context(), {
      cache: cache().value,
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  test('serves a token-bound object when the URL token is valid for the asset', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const bucket: PublicAssetBucket = {
      head: async () => metadataObject({ token }),
      get: async () => bodyObject(new Uint8Array([1, 2, 3]), { token }),
    };

    const response = await handlePublicAssetRequest(request(token), env(bucket), context(), {
      cache: cache().value,
    });

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });
});

function recordingBucket(bytes: Uint8Array, options: { etag?: string } = {}) {
  const etag = options.etag ?? 'etag-one';
  const head = vi.fn(async () => metadataObject({ etag }));
  const get = vi.fn(async (_key: string, getOptions?: R2GetOptions) => {
    const range = getOptions?.range as { offset: number; length: number } | undefined;
    const sliced = range ? bytes.slice(range.offset, range.offset + range.length) : bytes;
    return bodyObject(sliced, { etag, range, size: bytes.byteLength });
  });
  return { head, get, value: { head, get } satisfies PublicAssetBucket };
}

const PAYLOAD = new Uint8Array([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);

async function drained(ctx: PendingContext): Promise<void> {
  await Promise.all(ctx.pending);
}

describe('public asset delivery boundary', () => {
  async function harness() {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const bucket = recordingBucket(PAYLOAD);
    const cacheState = cache();
    const ctx = context();
    const run = (init?: RequestInit) =>
      handlePublicAssetRequest(request(token, init), env(bucket.value), ctx, {
        cache: cacheState.value,
      });
    return { token, bucket, cacheState, ctx, run };
  }

  test('a full GET serves from R2, sets the asset headers, and populates the cache', async () => {
    const { bucket, cacheState, ctx, run } = await harness();

    const response = await run();

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('application/pdf');
    expect(response?.headers.get('Content-Disposition')).toBe(
      'inline; filename="faction-sheet.pdf"'
    );
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(response?.headers.get('Accept-Ranges')).toBe('bytes');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(PAYLOAD);
    expect(bucket.head).toHaveBeenCalledTimes(1);
    expect(bucket.get).toHaveBeenCalledTimes(1);
    await drained(ctx);
    expect(cacheState.put).toHaveBeenCalledTimes(1);
  });

  test('cached and uncached GETs are observably equivalent, and the cache hit skips R2 reads', async () => {
    const { bucket, ctx, run } = await harness();
    const first = await run();
    const firstBytes = new Uint8Array(await first!.arrayBuffer());
    await drained(ctx);

    const second = await run();

    expect(second?.status).toBe(200);
    expect(new Uint8Array(await second!.arrayBuffer())).toEqual(firstBytes);
    expect(bucket.get).toHaveBeenCalledTimes(1);
    expect(second?.headers.get('Content-Type')).toBe(first?.headers.get('Content-Type'));
    expect(second?.headers.get('ETag')).toBe(first?.headers.get('ETag'));
  });

  test('HEAD returns the GET metadata without a body and without an R2 object read', async () => {
    const { bucket, run } = await harness();

    const response = await run({ method: 'HEAD' });

    expect(response?.status).toBe(200);
    expect(response?.body).toBeNull();
    expect(response?.headers.get('Content-Length')).toBe('10');
    expect(response?.headers.get('Content-Type')).toBe('application/pdf');
    expect(bucket.get).not.toHaveBeenCalled();
  });

  test('a matching If-None-Match returns 304 with no body and no content length', async () => {
    const { bucket, run } = await harness();

    const response = await run({ headers: { 'If-None-Match': '"etag-one"' } });

    expect(response?.status).toBe(304);
    expect(response?.body).toBeNull();
    expect(response?.headers.get('Content-Length')).toBeNull();
    expect(bucket.get).not.toHaveBeenCalled();
  });

  test('a non-matching If-None-Match serves the full asset', async () => {
    const { run } = await harness();

    const response = await run({ headers: { 'If-None-Match': '"stale"' } });

    expect(response?.status).toBe(200);
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(PAYLOAD);
  });

  test('a non-matching If-Match returns 412 no-store, and precedes If-None-Match', async () => {
    const { run } = await harness();

    const response = await run({
      headers: { 'If-Match': '"other"', 'If-None-Match': '"etag-one"' },
    });

    expect(response?.status).toBe(412);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(response?.body).toBeNull();
  });

  test('a satisfiable range returns 206 with the correct slice and Content-Range', async () => {
    const { run } = await harness();

    const response = await run({ headers: { Range: 'bytes=2-4' } });

    expect(response?.status).toBe(206);
    expect(response?.headers.get('Content-Range')).toBe('bytes 2-4/10');
    expect(response?.headers.get('Content-Length')).toBe('3');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(PAYLOAD.slice(2, 5));
  });

  test('an open-ended range returns the remainder of the asset', async () => {
    const { run } = await harness();

    const response = await run({ headers: { Range: 'bytes=7-' } });

    expect(response?.status).toBe(206);
    expect(response?.headers.get('Content-Range')).toBe('bytes 7-9/10');
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(PAYLOAD.slice(7));
  });

  test('an unsatisfiable range returns 416 with the asset size', async () => {
    const { bucket, run } = await harness();

    const response = await run({ headers: { Range: 'bytes=99-' } });

    expect(response?.status).toBe(416);
    expect(response?.headers.get('Content-Range')).toBe('bytes */10');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(bucket.get).not.toHaveBeenCalled();
  });

  test('date preconditions apply when no entity tags are sent, ignoring invalid dates', async () => {
    const { run } = await harness();

    const notModified = await run({
      headers: { 'If-Modified-Since': new Date('2026-07-18T12:00:00Z').toUTCString() },
    });
    expect(notModified?.status).toBe(304);

    const invalidDate = await run({ headers: { 'If-Modified-Since': 'not-a-date' } });
    expect(invalidDate?.status).toBe(200);

    const unmodifiedSinceFails = await run({
      headers: { 'If-Unmodified-Since': new Date('2026-07-16T12:00:00Z').toUTCString() },
    });
    expect(unmodifiedSinceFails?.status).toBe(412);
  });

  test('entity-tag comparison: If-None-Match matches weakly, If-Match requires strong', async () => {
    const { run } = await harness();

    const weakNoneMatch = await run({ headers: { 'If-None-Match': 'W/"etag-one"' } });
    expect(weakNoneMatch?.status).toBe(304);

    const weakIfMatch = await run({ headers: { 'If-Match': 'W/"etag-one"' } });
    expect(weakIfMatch?.status).toBe(412);

    const star = await run({ headers: { 'If-None-Match': '*' } });
    expect(star?.status).toBe(304);
  });

  test('legacy RFC 850 and asctime dates are honored in preconditions', async () => {
    const { run } = await harness();

    const rfc850 = await run({
      headers: { 'If-Modified-Since': 'Friday, 17-Jul-26 12:00:00 GMT' },
    });
    expect(rfc850?.status).toBe(304);

    const asctime = await run({ headers: { 'If-Modified-Since': 'Fri Jul 17 12:00:00 2026' } });
    expect(asctime?.status).toBe(304);

    const wrongWeekday = await run({
      headers: { 'If-Modified-Since': 'Thu, 17 Jul 2026 12:00:00 GMT' },
    });
    expect(wrongWeekday?.status).toBe(200);
  });

  test('a stale If-Range downgrades a range request to the full asset', async () => {
    const { run } = await harness();

    const response = await run({ headers: { Range: 'bytes=2-4', 'If-Range': '"stale"' } });

    expect(response?.status).toBe(200);
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(PAYLOAD);
  });

  test('a missing R2 object returns a sanitized 404', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const head = vi.fn(async () => null);
    const get = vi.fn();
    const response = await handlePublicAssetRequest(
      request(token),
      env({ head, get } as PublicAssetBucket),
      context(),
      { cache: cache().value }
    );

    expect(response?.status).toBe(404);
    expect(await response?.text()).toBe('Not Found');
    expect(get).not.toHaveBeenCalled();
  });

  test('an R2 failure returns a sanitized 503 exposing no provider details', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const head = vi.fn(async () => {
      throw new Error('R2 internal: bucket key secret-name');
    });
    const response = await handlePublicAssetRequest(
      request(token),
      env({ head, get: vi.fn() } as PublicAssetBucket),
      context(),
      { cache: cache().value }
    );

    expect(response?.status).toBe(503);
    expect(await response?.text()).toBe('Asset Temporarily Unavailable');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
  });

  test('a cache failure falls through to R2 with an equivalent response', async () => {
    const { bucket, token } = await harness();
    const failingCache: PublicAssetCache = {
      match: async () => {
        throw new Error('cache backend down');
      },
      put: async () => {},
    };

    const response = await handlePublicAssetRequest(request(token), env(bucket.value), context(), {
      cache: failingCache,
    });

    expect(response?.status).toBe(200);
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(PAYLOAD);
  });

  test('a stale cached body is cancelled exactly once before the fresh R2 read', async () => {
    const { bucket, cacheState, token, run, ctx } = await harness();
    const cancel = vi.fn(async () => {});
    const staleStream = new ReadableStream({ cancel });
    const canonical = request(token);
    const url = new URL(canonical.url);
    const staleKey = new Request(url.toString(), { method: 'GET' });
    cacheState.entries.set(
      staleKey.url,
      new Response(staleStream, {
        status: 200,
        headers: { ETag: '"etag-stale"', 'Content-Length': '10' },
      })
    );

    const response = await run();

    expect(response?.status).toBe(200);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(bucket.get).toHaveBeenCalledTimes(1);
    await drained(ctx);
  });
});
