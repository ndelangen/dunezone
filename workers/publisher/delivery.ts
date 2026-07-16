import { isValidCacheSigningSecret, verifyCacheToken } from '../../convex/lib/assetPublisherHttp';
import {
  type AssetRepresentation,
  type AssetRequestDecision,
  evaluateAssetRequest,
} from './delivery-http';
import { factionSheetKey } from './r2';

const ASSET_TYPE = 'faction_sheet' as const;
const TOKEN_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const NO_STORE = 'no-store';
const FACTION_ID_PATTERN = /^[0-9a-z]{16,64}$/;
const PUBLIC_ROUTE_PATTERN = /^\/published\/factions\/([0-9a-z]{16,64})\/sheet\.pdf$/;

export type PublicAssetCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export type PublicAssetBucket = {
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
  head(key: string): Promise<R2Object | null>;
};

type DeliveryDependencies = {
  cache?: PublicAssetCache;
};

function noStoreResponse(body: BodyInit | null, status: number, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set('Cache-Control', NO_STORE);
  return new Response(body, { status, headers: resultHeaders });
}

function errorResponse(status: number, message: string, headers?: HeadersInit): Response {
  return noStoreResponse(message, status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...Object.fromEntries(new Headers(headers)),
  });
}

function exactToken(url: URL): string | null | undefined {
  const tokens = url.searchParams.getAll('v');
  if (tokens.length === 0) return undefined;
  if (tokens.length !== 1 || tokens[0].length === 0) return null;
  return tokens[0];
}

function cacheRequest(request: Request, stablePath: string, token: string): Request {
  const url = new URL(request.url);
  url.pathname = stablePath;
  url.search = `?v=${encodeURIComponent(token)}`;
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

function rangeCacheRequest(base: Request, range: string): Request {
  return new Request(base.url, { method: 'GET', headers: { Range: range } });
}

function assetHeaders(object: R2Object, tokenized: boolean): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Disposition', 'inline; filename="faction-sheet.pdf"');
  headers.set('Content-Length', String(object.size));
  headers.set('Content-Type', 'application/pdf');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', tokenized ? TOKEN_CACHE_CONTROL : NO_STORE);
  return headers;
}

function responseRepresentation(response: Response): AssetRepresentation {
  const contentLength = response.headers.get('Content-Length');
  const size = contentLength !== null && /^\d+$/.test(contentLength) ? Number(contentLength) : NaN;
  return {
    exists: true,
    etag: response.headers.get('ETag') ?? undefined,
    lastModified: response.headers.get('Last-Modified') ?? undefined,
    size: Number.isSafeInteger(size) ? size : undefined,
  };
}

function objectRepresentation(object: R2Object | null): AssetRepresentation {
  return object
    ? {
        exists: true,
        etag: object.httpEtag,
        lastModified: object.uploaded.toUTCString(),
        size: object.size,
      }
    : { exists: false };
}

function conditionalHeaders(headers: Headers, status: 304 | 412): Headers {
  const result = new Headers(headers);
  result.delete('Content-Length');
  result.delete('Content-Range');
  if (status === 412) result.set('Cache-Control', NO_STORE);
  return result;
}

function rangeErrorHeaders(headers: Headers, size: number | undefined): Headers {
  const result = new Headers(headers);
  result.delete('Content-Length');
  result.set('Cache-Control', NO_STORE);
  if (size === undefined) result.delete('Content-Range');
  else result.set('Content-Range', `bytes */${size}`);
  return result;
}

async function safeCachePut(cache: PublicAssetCache, key: Request, value: Response): Promise<void> {
  try {
    await cache.put(key, value);
  } catch {
    console.error(JSON.stringify({ event: 'asset_delivery_cache_put', result: 'failed' }));
  }
}

async function cancelReadableBody(body: ReadableStream | null | undefined): Promise<void> {
  if (!body) return;
  try {
    await body.cancel();
  } catch {
    // The response metadata remains usable when a local stream is already closed.
  }
}

async function cancelResponseBody(response: Response | undefined): Promise<void> {
  await cancelReadableBody(response?.body);
}

async function cancelR2Body(value: R2ObjectBody | R2Object): Promise<void> {
  await cancelReadableBody('body' in value ? value.body : null);
}

function metadataResponse(
  decision: Extract<AssetRequestDecision, { status: 200 | 304 | 412 | 416 }>,
  headers: Headers
): Response {
  if (decision.status === 304 || decision.status === 412) {
    return new Response(null, {
      status: decision.status,
      headers: conditionalHeaders(headers, decision.status),
    });
  }
  if (decision.status === 416) {
    return new Response(null, { status: 416, headers: rangeErrorHeaders(headers, decision.size) });
  }
  return new Response(null, { status: 200, headers });
}

async function cachedAssetResponse(
  request: Request,
  hit: Response,
  cache: PublicAssetCache,
  cacheKey: Request
): Promise<Response> {
  const representation = responseRepresentation(hit);
  const decision = evaluateAssetRequest(request, representation);
  if (decision.status === 200) {
    if (request.method === 'GET') return hit;
    const headers = new Headers(hit.headers);
    await cancelResponseBody(hit);
    return metadataResponse(decision, headers);
  }
  if (decision.status === 304 || decision.status === 412 || decision.status === 416) {
    const headers = new Headers(hit.headers);
    await cancelResponseBody(hit);
    return metadataResponse(decision, headers);
  }
  if (decision.status !== 206) {
    await cancelResponseBody(hit);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }

  const rangeValue = request.headers.get('Range');
  await cancelResponseBody(hit);
  if (!rangeValue) return errorResponse(503, 'Asset Temporarily Unavailable');
  let partial: Response | undefined;
  try {
    partial = await cache.match(rangeCacheRequest(cacheKey, rangeValue));
  } catch {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  if (partial?.status !== 206) {
    await cancelResponseBody(partial);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  const currentSize = responseRepresentation(hit).size;
  if (
    representation.size === undefined ||
    currentSize === undefined ||
    currentSize !== representation.size
  ) {
    await cancelResponseBody(partial);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  const headers = new Headers(partial.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', NO_STORE);
  headers.set('Content-Length', String(decision.range.length));
  headers.set(
    'Content-Range',
    `bytes ${decision.range.offset}-${decision.range.offset + decision.range.length - 1}/${currentSize}`
  );
  return new Response(partial.body, { status: 206, headers });
}

async function r2BodyResponse(
  request: Request,
  object: R2ObjectBody,
  decision: Extract<AssetRequestDecision, { status: 200 | 206 }>,
  tokenized: boolean,
  cache: PublicAssetCache,
  cacheKey: Request | null,
  ctx: Pick<ExecutionContext, 'waitUntil'>
): Promise<Response> {
  const headers = assetHeaders(object, tokenized);
  if (decision.status === 206) {
    headers.set('Cache-Control', NO_STORE);
    headers.set('Content-Length', String(decision.range.length));
    headers.set(
      'Content-Range',
      `bytes ${decision.range.offset}-${decision.range.offset + decision.range.length - 1}/${object.size}`
    );
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  const result = new Response(object.body, { status: 200, headers });
  if (cacheKey && request.method === 'GET') {
    ctx.waitUntil(safeCachePut(cache, cacheKey, result.clone()));
  }
  return result;
}

export function factionSheetPublicPath(factionId: string): string {
  if (!FACTION_ID_PATTERN.test(factionId)) throw new Error('Invalid Convex faction id');
  return `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf`;
}

export async function handlePublicAssetRequest(
  request: Request,
  env: Pick<Env, 'ASSET_BUCKET' | 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET'>,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  dependencies: DeliveryDependencies = {}
): Promise<Response | null> {
  const url = new URL(request.url);
  const ownsNamespace = url.pathname === '/published' || url.pathname.startsWith('/published/');
  if (!ownsNamespace) return null;

  const route = PUBLIC_ROUTE_PATTERN.exec(url.pathname);
  if (!route) return errorResponse(404, 'Not Found');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (!isValidCacheSigningSecret(env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET)) {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }

  const factionId = route[1];
  if (!factionId) return errorResponse(404, 'Not Found');
  const stablePath = factionSheetPublicPath(factionId);
  const token = exactToken(url);
  if (token === null) return errorResponse(404, 'Not Found');

  let verifiedToken: string | undefined;
  if (token !== undefined) {
    if (
      !(await verifyCacheToken(
        token,
        factionId,
        ASSET_TYPE,
        env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET
      ))
    ) {
      return errorResponse(404, 'Not Found');
    }
    verifiedToken = token;
  }

  const cache = dependencies.cache ?? caches.default;
  const canonicalCacheRequest = verifiedToken
    ? cacheRequest(request, stablePath, verifiedToken)
    : null;
  if (canonicalCacheRequest) {
    try {
      const hit = await cache.match(canonicalCacheRequest);
      if (hit) return await cachedAssetResponse(request, hit, cache, canonicalCacheRequest);
    } catch {
      console.error(JSON.stringify({ event: 'asset_delivery_cache_match', result: 'failed' }));
    }
  }

  const bucket = env.ASSET_BUCKET as PublicAssetBucket;
  const key = factionSheetKey(factionId);
  const metadataFirst = request.method === 'HEAD' || request.headers.has('Range');
  if (metadataFirst) {
    let metadata: R2Object | null;
    try {
      metadata = await bucket.head(key);
    } catch {
      return errorResponse(503, 'Asset Temporarily Unavailable');
    }
    const decision = evaluateAssetRequest(request, objectRepresentation(metadata));
    if (decision.status === 404) return errorResponse(404, 'Not Found');
    if (decision.status === 304 || decision.status === 412 || decision.status === 416) {
      const headers = metadata
        ? assetHeaders(metadata, verifiedToken !== undefined)
        : new Headers();
      return metadataResponse(decision, headers);
    }
    if (request.method === 'HEAD') {
      if (!metadata || decision.status !== 200)
        return errorResponse(503, 'Asset Temporarily Unavailable');
      return metadataResponse(decision, assetHeaders(metadata, verifiedToken !== undefined));
    }
    if (!metadata || (decision.status !== 200 && decision.status !== 206)) {
      return errorResponse(503, 'Asset Temporarily Unavailable');
    }

    let object: R2ObjectBody | R2Object | null;
    try {
      object = await bucket.get(key, {
        onlyIf: { etagMatches: metadata.etag },
        ...(decision.status === 206 ? { range: decision.range } : {}),
      });
    } catch {
      return errorResponse(503, 'Asset Temporarily Unavailable');
    }
    if (!object || !('body' in object) || object.etag !== metadata.etag) {
      return errorResponse(503, 'Asset Temporarily Unavailable');
    }
    return await r2BodyResponse(
      request,
      object,
      decision,
      verifiedToken !== undefined,
      cache,
      canonicalCacheRequest,
      ctx
    );
  }

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await bucket.get(key);
  } catch {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  const representation = objectRepresentation(object);
  const decision = evaluateAssetRequest(request, representation);
  if (decision.status === 404) return errorResponse(404, 'Not Found');
  if (decision.status === 304 || decision.status === 412 || decision.status === 416) {
    if (object && 'body' in object) await cancelR2Body(object);
    const headers = object ? assetHeaders(object, verifiedToken !== undefined) : new Headers();
    return metadataResponse(decision, headers);
  }
  if (!object || !('body' in object) || decision.status !== 200) {
    if (object && 'body' in object) await cancelR2Body(object);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  return await r2BodyResponse(
    request,
    object,
    decision,
    verifiedToken !== undefined,
    cache,
    canonicalCacheRequest,
    ctx
  );
}
