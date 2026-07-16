import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret, createCacheToken } from '../../convex/lib/assetPublisherHttp';
import {
  factionSheetPublicPath,
  handlePublicAssetRequest,
  type PublicAssetBucket,
  type PublicAssetCache,
} from './delivery';
import { fakeR2Object } from './test-helpers';

const FACTION_ID = 'j57c8t9m2q4w6e8r0y2u4i6o8p0a2s4d';
const OTHER_FACTION_ID = 'k68d9u0n3r5x7f9s1z3v5j7p9q1b3t5e';
const SECRET = createCacheSigningSecret();
const NOW = new Date('2026-07-16T12:00:00.000Z');

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
  options: { etag?: string; range?: R2Range; size?: number } = {}
): R2ObjectBody {
  const body = new Response(bytes).body;
  if (!body) throw new Error('missing test stream');
  const base = fakeR2Object({
    key: `factions/${FACTION_ID}/sheet.pdf`,
    etag: options.etag ?? 'etag-one',
    size: options.size ?? (options.range ? 10 : bytes.byteLength),
    uploaded: NOW,
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

function metadataObject(etag = 'etag-one', size = 10): R2Object {
  return fakeR2Object({
    key: `factions/${FACTION_ID}/sheet.pdf`,
    etag,
    size,
    uploaded: NOW,
  });
}

function cache(options: { putError?: Error } = {}) {
  const entries = new Map<string, Response>();
  const match = vi.fn(async (request: Request) => {
    const stored = entries.get(request.url);
    if (!stored) return undefined;
    const bytes = new Uint8Array(await stored.clone().arrayBuffer());
    const storedHeaders = new Headers(stored.headers);
    const range = request.headers.get('Range');
    if (!range) return new Response(bytes, { status: stored.status, headers: storedHeaders });
    const parsed = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(range);
    if (!parsed) return new Response(null, { status: 416 });
    const suffix = parsed[3];
    const start =
      suffix === undefined ? Number(parsed[1]) : Math.max(0, bytes.byteLength - Number(suffix));
    const end = suffix !== undefined || parsed[2] === '' ? bytes.byteLength - 1 : Number(parsed[2]);
    if (start >= bytes.byteLength || end < start) return new Response(null, { status: 416 });
    const boundedEnd = Math.min(end, bytes.byteLength - 1);
    const body = bytes.slice(start, boundedEnd + 1);
    const headers = storedHeaders;
    headers.set('Content-Length', String(body.byteLength));
    headers.set('Content-Range', `bytes ${start}-${boundedEnd}/${bytes.byteLength}`);
    return new Response(body, { status: 206, headers });
  });
  const put = vi.fn(async (request: Request, response: Response) => {
    if (options.putError) throw options.putError;
    const bytes = await response.arrayBuffer();
    entries.set(
      request.url,
      new Response(bytes, { status: response.status, headers: new Headers(response.headers) })
    );
  });
  return { entries, match, put, value: { match, put } satisfies PublicAssetCache };
}

function cancelableCacheResponse(
  options: { status?: number; contentLength?: string; cancelError?: Error } = {}
): { response: Response; cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn(async () => {
    if (options.cancelError) throw options.cancelError;
  });
  const body = new ReadableStream({ cancel });
  return {
    response: new Response(body, {
      status: options.status ?? 200,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': options.contentLength ?? '10',
        'Content-Type': 'application/pdf',
        ETag: '"etag-one"',
        'Last-Modified': 'Thu, 16 Jul 2026 12:00:00 GMT',
      },
    }),
    cancel,
  };
}

function env(bucket: PublicAssetBucket) {
  return {
    ASSET_BUCKET: bucket,
    ASSET_PUBLISHER_CACHE_TOKEN_SECRET: SECRET,
  } as Pick<Env, 'ASSET_BUCKET' | 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET'>;
}

function request(token?: string, suffix = '', init?: RequestInit): Request {
  const path = factionSheetPublicPath(FACTION_ID);
  const query = token === undefined ? '' : `?v=${encodeURIComponent(token)}${suffix}`;
  return new Request(`https://assets.example.com${path}${query}`, init);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('public faction-sheet delivery', () => {
  test('matches only the stable Convex-id route and permits only GET or HEAD', async () => {
    const bucket = { get: vi.fn(), head: vi.fn() } as PublicAssetBucket;
    const cacheState = cache();
    const namespace404 = await handlePublicAssetRequest(
      new Request('https://assets.example.com/published/factions/mutable-slug/sheet.pdf'),
      env(bucket),
      context(),
      { cache: cacheState.value }
    );
    expect(namespace404?.status).toBe(404);
    expect(namespace404?.headers.get('Cache-Control')).toBe('no-store');
    await expect(
      handlePublicAssetRequest(
        new Request(`https://assets.example.com/factions/${FACTION_ID}/sheet.pdf`),
        env(bucket),
        context(),
        { cache: cacheState.value }
      )
    ).resolves.toBeNull();

    const response = await handlePublicAssetRequest(
      request(undefined, '', { method: 'POST' }),
      env(bucket),
      context(),
      { cache: cacheState.value }
    );
    expect(response?.status).toBe(405);
    expect(response?.headers.get('Allow')).toBe('GET, HEAD');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(bucket.get).not.toHaveBeenCalled();
    expect(cacheState.match).not.toHaveBeenCalled();
  });

  test('rejects malformed, repeated, tampered, and faction-bound tokens before cache or R2', async () => {
    const valid = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const otherFactionToken = await createCacheToken(OTHER_FACTION_ID, 'faction_sheet', SECRET);
    const values = [
      '',
      'not-a-token',
      `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`,
      otherFactionToken,
    ];
    for (const token of values) {
      const get = vi.fn();
      const cacheState = cache();
      const response = await handlePublicAssetRequest(
        request(token),
        env({ get, head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: cacheState.value }
      );
      expect(response?.status).toBe(404);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(cacheState.match).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
    }

    const get = vi.fn();
    const cacheState = cache();
    const repeated = await handlePublicAssetRequest(
      request(valid, `&v=${encodeURIComponent(valid)}`),
      env({ get, head: vi.fn() } as PublicAssetBucket),
      context(),
      { cache: cacheState.value }
    );
    expect(repeated?.status).toBe(404);
    expect(cacheState.match).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
  });

  test.each([
    undefined,
    '',
    'too-short',
    `s1.${'a'.repeat(42)}`,
  ])('fails closed before Cache API or R2 for a missing or weak signing secret', async (signingSecret) => {
    const get = vi.fn();
    const head = vi.fn();
    const cacheState = cache();
    const response = await handlePublicAssetRequest(
      request(),
      {
        ASSET_BUCKET: { get, head } as PublicAssetBucket,
        ASSET_PUBLISHER_CACHE_TOKEN_SECRET: signingSecret,
      } as Pick<Env, 'ASSET_BUCKET' | 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET'>,
      context(),
      { cache: cacheState.value }
    );

    expect(response?.status).toBe(503);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(cacheState.match).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
  });

  test('omits Content-Range on a 416 until a numeric representation size is known', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const cacheState = cache();
    const cacheKey = `https://assets.example.com${factionSheetPublicPath(FACTION_ID)}?v=${encodeURIComponent(token)}`;
    cacheState.entries.set(
      cacheKey,
      new Response(new Uint8Array([1]), {
        headers: { ETag: '"etag-one"', 'Last-Modified': 'Thu, 16 Jul 2026 12:00:00 GMT' },
      })
    );
    const get = vi.fn();
    const response = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: 'bytes=invalid' } }),
      env({ get, head: vi.fn() } as PublicAssetBucket),
      context(),
      { cache: cacheState.value }
    );
    expect(response?.status).toBe(416);
    expect(response?.headers.get('Content-Range')).toBeNull();
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(get).not.toHaveBeenCalled();
  });

  test('serves tokenless bytes no-store without reading or writing Cache API', async () => {
    const get = vi.fn(async () =>
      bodyObject(new Uint8Array([1, 2, 3]), {
        range: { offset: 0, length: 3 },
        size: 3,
      })
    );
    const cacheState = cache();
    const response = await handlePublicAssetRequest(
      request(),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cacheState.value }
    );
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Range')).toBeNull();
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(await response?.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(get).toHaveBeenCalledOnce();
    expect(cacheState.match).not.toHaveBeenCalled();
    expect(cacheState.put).not.toHaveBeenCalled();
  });

  test('canonicalizes arbitrary query parameters and separates old and new valid tokens', async () => {
    const oldToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const newToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn(async () => bodyObject(new Uint8Array([1, 2, 3])));
    const cacheState = cache();

    const firstContext = context();
    const first = await handlePublicAssetRequest(
      request(oldToken, '&ignored=one&x=two'),
      env({ get, head: vi.fn() }),
      firstContext,
      { cache: cacheState.value }
    );
    expect(await first?.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    await Promise.all(firstContext.pending);
    const expectedOldKey = `https://assets.example.com${factionSheetPublicPath(FACTION_ID)}?v=${encodeURIComponent(oldToken)}`;
    expect([...cacheState.entries.keys()]).toEqual([expectedOldKey]);

    const oldHit = await handlePublicAssetRequest(
      request(oldToken, '&ignored=different'),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cacheState.value }
    );
    expect(await oldHit?.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer);
    expect(get).toHaveBeenCalledOnce();

    const newContext = context();
    const newMiss = await handlePublicAssetRequest(
      request(newToken),
      env({ get, head: vi.fn() }),
      newContext,
      { cache: cacheState.value }
    );
    await newMiss?.arrayBuffer();
    await Promise.all(newContext.pending);
    expect(get).toHaveBeenCalledTimes(2);
    expect(cacheState.entries.size).toBe(2);
  });

  test('uses a cached full response for Range/HEAD/preconditions with no R2 fallback', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn(async () => bodyObject(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])));
    const cacheState = cache();
    const populateContext = context();
    const populate = await handlePublicAssetRequest(
      request(token),
      env({ get, head: vi.fn() }),
      populateContext,
      { cache: cacheState.value }
    );
    await populate?.arrayBuffer();
    await Promise.all(populateContext.pending);
    expect(get).toHaveBeenCalledOnce();

    const partial = await handlePublicAssetRequest(
      request(token, '', {
        headers: { Range: 'bytes=2-4', 'If-Range': '"etag-one"' },
      }),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cacheState.value }
    );
    expect(partial?.status).toBe(206);
    expect(partial?.headers.get('Cache-Control')).toBe('no-store');
    expect(partial?.headers.get('Content-Range')).toBe('bytes 2-4/10');
    expect(await partial?.arrayBuffer()).toEqual(new Uint8Array([2, 3, 4]).buffer);
    expect(get).toHaveBeenCalledOnce();
    const baseLookup = cacheState.match.mock.calls.at(-2)?.[0];
    const rangeLookup = cacheState.match.mock.calls.at(-1)?.[0];
    expect(baseLookup?.headers.get('Range')).toBeNull();
    expect(baseLookup?.headers.get('If-Range')).toBeNull();
    expect(rangeLookup?.headers.get('Range')).toBe('bytes=2-4');
    expect([...(rangeLookup?.headers.keys() ?? [])]).toEqual(['range']);

    const callsBeforeHead = cacheState.match.mock.calls.length;
    const head = await handlePublicAssetRequest(
      request(token, '', { method: 'HEAD', headers: { Range: 'bytes=2-4' } }),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cacheState.value }
    );
    expect(head?.status).toBe(200);
    expect((await head?.arrayBuffer())?.byteLength).toBe(0);
    expect(cacheState.match.mock.calls.length).toBe(callsBeforeHead + 1);
    expect(get).toHaveBeenCalledOnce();

    const failed = await handlePublicAssetRequest(
      request(token, '', { headers: { 'If-Match': '"other"' } }),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cacheState.value }
    );
    expect(failed?.status).toBe(412);
    expect(failed?.headers.get('Cache-Control')).toBe('no-store');
    expect(get).toHaveBeenCalledOnce();

    const notModified = await handlePublicAssetRequest(
      request(token, '', { headers: { 'If-None-Match': 'W/"etag-one"' } }),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cacheState.value }
    );
    expect(notModified?.status).toBe(304);
    expect(notModified?.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(get).toHaveBeenCalledOnce();

    for (const invalidRange of ['bytes=0-1,3-4', 'bytes=oops', 'bytes=100-200']) {
      const invalid = await handlePublicAssetRequest(
        request(token, '', { headers: { Range: invalidRange } }),
        env({ get, head: vi.fn() }),
        context(),
        { cache: cacheState.value }
      );
      expect(invalid?.status).toBe(416);
      expect(invalid?.headers.get('Content-Range')).toBe('bytes */10');
      expect(invalid?.headers.get('Cache-Control')).toBe('no-store');
      expect(get).toHaveBeenCalledOnce();
    }
  });

  describe('cached response body ownership', () => {
    test.each([
      ['HEAD 200', { method: 'HEAD' }, 200],
      ['304', { headers: { 'If-None-Match': '"etag-one"' } }, 304],
      ['412', { headers: { 'If-Match': '"other"' } }, 412],
      ['416', { headers: { Range: 'bytes=100-200' } }, 416],
    ] as const)('cancels the full metadata-only hit exactly once for %s', async (_label, init, status) => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const match = vi.fn(async () => full.response);
      const response = await handlePublicAssetRequest(
        request(token, '', init),
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response?.status).toBe(status);
      expect(full.cancel).toHaveBeenCalledOnce();
      expect(match).toHaveBeenCalledOnce();
    });

    test('cancels the full probe before transferring a usable partial body', async () => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const partial = cancelableCacheResponse({ status: 206, contentLength: '3' });
      const match = vi
        .fn<PublicAssetCache['match']>()
        .mockResolvedValueOnce(full.response)
        .mockResolvedValueOnce(partial.response);
      const response = await handlePublicAssetRequest(
        request(token, '', { headers: { Range: 'bytes=2-4' } }),
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response?.status).toBe(206);
      expect(full.cancel).toHaveBeenCalledOnce();
      expect(partial.cancel).not.toHaveBeenCalled();
      await response?.body?.cancel();
      expect(partial.cancel).toHaveBeenCalledOnce();
    });

    test('does not cancel a successful full GET hit before transferring ownership', async () => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const match = vi.fn(async () => full.response);
      const response = await handlePublicAssetRequest(
        request(token),
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response).toBe(full.response);
      expect(full.cancel).not.toHaveBeenCalled();
      await response?.body?.cancel();
      expect(full.cancel).toHaveBeenCalledOnce();
    });

    test('cancels the full probe when Range disappears before the second lookup', async () => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const match = vi.fn(async () => full.response);
      const rangedRequest = request(token, '', { headers: { Range: 'bytes=2-4' } });
      const originalGet = rangedRequest.headers.get.bind(rangedRequest.headers);
      let rangeReads = 0;
      vi.spyOn(rangedRequest.headers, 'get').mockImplementation((name) => {
        if (name.toLowerCase() === 'range') {
          rangeReads += 1;
          if (rangeReads > 1) return null;
        }
        return originalGet(name);
      });

      const response = await handlePublicAssetRequest(
        rangedRequest,
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response?.status).toBe(503);
      expect(full.cancel).toHaveBeenCalledOnce();
      expect(match).toHaveBeenCalledOnce();
    });

    test('keeps a second cache.match failure non-leaking after canceling the full probe', async () => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const match = vi
        .fn<PublicAssetCache['match']>()
        .mockResolvedValueOnce(full.response)
        .mockRejectedValueOnce(new Error('cache unavailable'));
      const response = await handlePublicAssetRequest(
        request(token, '', { headers: { Range: 'bytes=2-4' } }),
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response?.status).toBe(503);
      expect(full.cancel).toHaveBeenCalledOnce();
      expect(match).toHaveBeenCalledTimes(2);
    });

    test.each([
      200, 416,
    ])('cancels an unexpected partial status %s and the full probe exactly once', async (status) => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const partial = cancelableCacheResponse({ status });
      const match = vi
        .fn<PublicAssetCache['match']>()
        .mockResolvedValueOnce(full.response)
        .mockResolvedValueOnce(partial.response);
      const response = await handlePublicAssetRequest(
        request(token, '', { headers: { Range: 'bytes=2-4' } }),
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response?.status).toBe(503);
      expect(full.cancel).toHaveBeenCalledOnce();
      expect(partial.cancel).toHaveBeenCalledOnce();
    });

    test('cancels a 206 partial when the full representation size becomes unusable', async () => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse();
      const partial = cancelableCacheResponse({ status: 206, contentLength: '3' });
      const match = vi.fn<PublicAssetCache['match']>(async () => {
        if (match.mock.calls.length === 1) return full.response;
        full.response.headers.delete('Content-Length');
        return partial.response;
      });
      const response = await handlePublicAssetRequest(
        request(token, '', { headers: { Range: 'bytes=2-4' } }),
        env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
        context(),
        { cache: { match, put: vi.fn() } }
      );

      expect(response?.status).toBe(503);
      expect(full.cancel).toHaveBeenCalledOnce();
      expect(partial.cancel).toHaveBeenCalledOnce();
    });

    test('swallows cancellation rejection without an unhandled promise or double cancel', async () => {
      const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
      const full = cancelableCacheResponse({ cancelError: new Error('cancel failed') });
      const match = vi.fn(async () => full.response);

      await expect(
        handlePublicAssetRequest(
          request(token, '', { method: 'HEAD' }),
          env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
          context(),
          { cache: { match, put: vi.fn() } }
        )
      ).resolves.toMatchObject({ status: 200 });
      expect(full.cancel).toHaveBeenCalledOnce();
    });
  });

  test.each([
    ['strong ETag', '"etag-one"', 206],
    ['weak ETag', 'W/"etag-one"', 200],
    ['stale ETag', '"other"', 200],
    ['matching date', 'Thu, 16 Jul 2026 12:00:00 GMT', 206],
    ['stale date', 'Wed, 15 Jul 2026 12:00:00 GMT', 200],
    ['invalid date', '2026-07-16T12:00:00Z', 200],
  ] as const)('applies If-Range to a cached full representation: %s', async (_label, ifRange, expectedStatus) => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const cacheState = cache();
    const cacheKey = `https://assets.example.com${factionSheetPublicPath(FACTION_ID)}?v=${encodeURIComponent(token)}`;
    cacheState.entries.set(
      cacheKey,
      new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), {
        headers: {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Content-Length': '10',
          'Content-Type': 'application/pdf',
          ETag: '"etag-one"',
          'Last-Modified': 'Thu, 16 Jul 2026 12:00:00 GMT',
        },
      })
    );
    const get = vi.fn();
    const response = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: 'bytes=2-4', 'If-Range': ifRange } }),
      env({ get, head: vi.fn() } as PublicAssetBucket),
      context(),
      { cache: cacheState.value }
    );
    expect(response?.status).toBe(expectedStatus);
    expect((await response?.arrayBuffer())?.byteLength).toBe(expectedStatus === 206 ? 3 : 10);
    expect(get).not.toHaveBeenCalled();
    expect(cacheState.match).toHaveBeenCalledTimes(expectedStatus === 206 ? 2 : 1);
    if (expectedStatus === 206) {
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
    }
  });

  test.each([
    ['open', 'bytes=7-', { offset: 7, length: 3 }, [7, 8, 9]],
    ['suffix', 'bytes=-4', { offset: 6, length: 4 }, [6, 7, 8, 9]],
  ] as const)('serves an %s range from both cached full bytes and one ranged R2 get', async (_label, rangeHeader, expectedRange, expectedBytes) => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const cacheState = cache();
    const cacheKey = `https://assets.example.com${factionSheetPublicPath(FACTION_ID)}?v=${encodeURIComponent(token)}`;
    cacheState.entries.set(
      cacheKey,
      new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), {
        headers: {
          'Content-Length': '10',
          ETag: '"etag-one"',
          'Last-Modified': 'Thu, 16 Jul 2026 12:00:00 GMT',
        },
      })
    );
    const cached = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: rangeHeader } }),
      env({ get: vi.fn(), head: vi.fn() } as PublicAssetBucket),
      context(),
      { cache: cacheState.value }
    );
    expect(cached?.status).toBe(206);
    expect(new Uint8Array((await cached?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(expectedBytes)
    );

    const r2Cache = cache();
    const get = vi.fn(async (_key: string, _options?: R2GetOptions) =>
      bodyObject(new Uint8Array(expectedBytes), {
        etag: 'etag-one',
        range: expectedRange,
        size: 10,
      })
    );
    const r2 = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: rangeHeader } }),
      env({ get, head: vi.fn(async () => metadataObject('etag-one', 10)) }),
      context(),
      { cache: r2Cache.value }
    );
    expect(r2?.status).toBe(206);
    expect(new Uint8Array((await r2?.arrayBuffer()) ?? new ArrayBuffer(0))).toEqual(
      new Uint8Array(expectedBytes)
    );
    expect(get).toHaveBeenCalledOnce();
    expect(get.mock.calls[0]?.[1]?.range).toEqual(expectedRange);
  });

  test('allows an old issued token to cache the current stable bytes on a miss', async () => {
    const oldToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn(async () => bodyObject(new Uint8Array([9, 9, 9]), { etag: 'new-etag' }));
    const cacheState = cache();
    const ctx = context();
    const response = await handlePublicAssetRequest(
      request(oldToken),
      env({ get, head: vi.fn() }),
      ctx,
      { cache: cacheState.value }
    );
    expect(await response?.arrayBuffer()).toEqual(new Uint8Array([9, 9, 9]).buffer);
    await Promise.all(ctx.pending);
    expect(cacheState.put).toHaveBeenCalledOnce();
  });

  test('never caches missing objects or R2 failures', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    for (const get of [
      vi.fn(async () => null),
      vi.fn(async () => {
        throw new Error('R2 unavailable');
      }),
    ]) {
      const cacheState = cache();
      const response = await handlePublicAssetRequest(
        request(token),
        env({ get, head: vi.fn() }),
        context(),
        { cache: cacheState.value }
      );
      expect([404, 503]).toContain(response?.status);
      expect(response?.headers.get('Cache-Control')).toBe('no-store');
      expect(cacheState.put).not.toHaveBeenCalled();
      expect(get).toHaveBeenCalledOnce();
    }
  });

  test('serves one valid byte range and rejects malformed and unsatisfiable ranges no-store', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn(async () =>
      bodyObject(new Uint8Array([2, 3, 4]), { range: { offset: 2, length: 3 } })
    );
    const response = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: 'bytes=2-4' } }),
      env({ get, head: vi.fn(async () => metadataObject('etag-one', 10)) }),
      context(),
      { cache: cache().value }
    );
    expect(response?.status).toBe(206);
    expect(response?.headers.get('Content-Range')).toBe('bytes 2-4/10');
    expect(response?.headers.get('Content-Length')).toBe('3');
    expect(response?.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(await response?.arrayBuffer()).toEqual(new Uint8Array([2, 3, 4]).buffer);
    expect(get).toHaveBeenCalledOnce();

    const malformedGet = vi.fn();
    const malformedHead = vi.fn(async () => metadataObject('etag-one', 10));
    const malformed = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: 'bytes=0-1,3-4' } }),
      env({ get: malformedGet, head: malformedHead } as PublicAssetBucket),
      context(),
      { cache: cache().value }
    );
    expect(malformed?.status).toBe(416);
    expect(malformed?.headers.get('Content-Range')).toBe('bytes */10');
    expect(malformedGet).not.toHaveBeenCalled();
    expect(malformedHead).toHaveBeenCalledOnce();

    const unsatisfiableGet = vi.fn();
    const head = vi.fn(async () => metadataObject('etag-one', 10));
    const unsatisfiable = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: 'bytes=100-200' } }),
      env({ get: unsatisfiableGet, head }),
      context(),
      { cache: cache().value }
    );
    expect(unsatisfiable?.status).toBe(416);
    expect(unsatisfiable?.headers.get('Content-Range')).toBe('bytes */10');
    expect(unsatisfiable?.headers.get('Cache-Control')).toBe('no-store');
    expect(unsatisfiableGet).not.toHaveBeenCalled();
    expect(head).toHaveBeenCalledOnce();
  });

  test.each([
    ['strong ETag', '"etag-one"', 206, true],
    ['weak ETag', 'W/"etag-one"', 200, false],
    ['stale ETag', '"other"', 200, false],
    ['matching date', 'Thu, 16 Jul 2026 12:00:00 GMT', 206, true],
    ['stale date', 'Wed, 15 Jul 2026 12:00:00 GMT', 200, false],
    ['invalid date', '2026-07-16T12:00:00Z', 200, false],
  ] as const)('applies If-Range on an R2 miss: %s', async (_label, ifRange, expectedStatus, expectsRange) => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const head = vi.fn(async () => metadataObject('etag-one', 10));
    const get = vi.fn(async (_key: string, _options?: R2GetOptions) =>
      expectsRange
        ? bodyObject(new Uint8Array([2, 3, 4]), {
            etag: 'etag-one',
            range: { offset: 2, length: 3 },
            size: 10,
          })
        : bodyObject(new Uint8Array(10), { etag: 'etag-one', size: 10 })
    );
    const ctx = context();
    const response = await handlePublicAssetRequest(
      request(token, '', { headers: { Range: 'bytes=2-4', 'If-Range': ifRange } }),
      env({ get, head }),
      ctx,
      { cache: cache().value }
    );
    expect(response?.status).toBe(expectedStatus);
    expect(response?.headers.get('Cache-Control')).toBe(
      expectedStatus === 206 ? 'no-store' : 'public, max-age=31536000, immutable'
    );
    await response?.arrayBuffer();
    await Promise.all(ctx.pending);
    expect(head).toHaveBeenCalledOnce();
    expect(get).toHaveBeenCalledOnce();
    const options = get.mock.calls[0]?.[1];
    expect(options?.range !== undefined).toBe(expectsRange);
  });

  test('returns correct PDF headers for HEAD and conditional outcomes', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn();
    const head = vi.fn(async () => metadataObject('etag-one', 10));
    const headResponse = await handlePublicAssetRequest(
      request(token, '', { method: 'HEAD' }),
      env({ get, head }),
      context(),
      { cache: cache().value }
    );
    expect(headResponse?.status).toBe(200);
    expect((await headResponse?.arrayBuffer())?.byteLength).toBe(0);
    expect(headResponse?.headers.get('Content-Type')).toBe('application/pdf');
    expect(headResponse?.headers.get('Content-Disposition')).toBe(
      'inline; filename="faction-sheet.pdf"'
    );
    expect(headResponse?.headers.get('Content-Length')).toBe('10');
    expect(headResponse?.headers.get('ETag')).toBe('"etag-one"');
    expect(head).toHaveBeenCalledOnce();
    expect(get).not.toHaveBeenCalled();

    for (const [header, status] of [
      [{ 'If-None-Match': '"etag-one"' }, 304],
      [{ 'If-Match': '"other"' }, 412],
    ] as const) {
      const conditionalGet = vi.fn(async () => metadataObject());
      const conditional = await handlePublicAssetRequest(
        request(token, '', { headers: header }),
        env({ get: conditionalGet, head: vi.fn() }),
        context(),
        { cache: cache().value }
      );
      expect(conditional?.status).toBe(status);
      expect(conditional?.headers.get('ETag')).toBe('"etag-one"');
      if (status === 412) expect(conditional?.headers.get('Cache-Control')).toBe('no-store');
      if (status === 304) {
        expect(conditional?.headers.get('Cache-Control')).toBe(
          'public, max-age=31536000, immutable'
        );
      }
      expect(conditionalGet).toHaveBeenCalledOnce();
    }
  });

  test('evaluates If-Match star against an absent R2 representation before returning 404', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn(async () => null);
    const response = await handlePublicAssetRequest(
      request(token, '', { headers: { 'If-Match': '*' } }),
      env({ get, head: vi.fn() }),
      context(),
      { cache: cache().value }
    );
    expect(response?.status).toBe(412);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(get).toHaveBeenCalledOnce();
  });

  test('swallows cache.put rejection without breaking the response or leaking its signed URL', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const cacheState = cache({
      putError: new Error(
        'failed https://signed-user:SECRET@cache.example/private/path?v=SECRET_TOKEN'
      ),
    });
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx = context();
    const response = await handlePublicAssetRequest(
      request(token),
      env({ get: vi.fn(async () => bodyObject(new Uint8Array([1]))), head: vi.fn() }),
      ctx,
      { cache: cacheState.value }
    );
    expect(await response?.arrayBuffer()).toEqual(new Uint8Array([1]).buffer);
    await expect(Promise.all(ctx.pending)).resolves.toHaveLength(1);
    const logged = JSON.stringify(errorLog.mock.calls);
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('SECRET_TOKEN');
    expect(logged).not.toContain('/private/path');
  });

  test('documents data-center-local stampede behavior: concurrent misses each use one R2 get', async () => {
    const token = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const get = vi.fn(async () => bodyObject(new Uint8Array([1])));
    let releaseMatches: (() => void) | undefined;
    const bothMatches = new Promise<void>((resolve) => {
      releaseMatches = resolve;
    });
    const match = vi.fn(async () => {
      if (match.mock.calls.length === 2) releaseMatches?.();
      await bothMatches;
      return undefined;
    });
    const put = vi.fn(async () => undefined);
    const cacheState = { match, put } satisfies PublicAssetCache;
    const contexts = [context(), context()];
    const responses = await Promise.all(
      contexts.map((ctx) =>
        handlePublicAssetRequest(request(token), env({ get, head: vi.fn() }), ctx, {
          cache: cacheState,
        })
      )
    );
    await Promise.all(responses.map(async (response) => await response?.arrayBuffer()));
    await Promise.all(contexts.flatMap((ctx) => ctx.pending));
    expect(get).toHaveBeenCalledTimes(2);
    expect(match).toHaveBeenCalledTimes(2);
    expect(put).toHaveBeenCalledTimes(2);
  });
});
