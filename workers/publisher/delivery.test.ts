import { afterEach, describe, expect, test, vi } from 'vitest';

import { createCacheSigningSecret, createCacheToken } from '../../convex/lib/assetPublisherHttp';
import {
  factionSheetPublicPath,
  handlePublicAssetRequest,
  type PublicAssetBucket,
  type PublicAssetCache,
} from './delivery';
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
  if (!body) throw new Error('missing test stream');
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

  test('rejects a valid token when object metadata binds a different unpublished token', async () => {
    const oldToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const newToken = await createCacheToken(FACTION_ID, 'faction_sheet', SECRET);
    const bucket: PublicAssetBucket = {
      head: async () => metadataObject({ token: newToken }),
      get: vi.fn(),
    };

    const response = await handlePublicAssetRequest(request(oldToken), env(bucket), context(), {
      cache: cache().value,
    });

    expect(response?.status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled();
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

  test('serves a token-bound object only when the URL token matches the stored metadata', async () => {
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
