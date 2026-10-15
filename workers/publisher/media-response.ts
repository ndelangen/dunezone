/**
 * Responses shared by the immutable media namespaces (#1888): `/__media/src` for originals and `/m` for variants.
 * Both serve content-addressed R2 objects, so a hit is cacheable forever and every refusal is `no-store`.
 *
 * A 200 for `/m` or a legacy raster URL is also kept in the edge cache, so repeat reads in a colo stay off the bucket (#1888 follow-up).
 * The cache key is the URL alone: a variant name never changes meaning, and a legacy answer carries its own hour-long policy, which the cache honours.
 * Refusals are `no-store` and never enter it.
 */

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type Refusal = { status: number; message: string };

export const NOT_FOUND: Refusal = { status: 404, message: 'Not found' };
export const METHOD_NOT_ALLOWED: Refusal = { status: 405, message: 'Method not allowed' };

/** The integrity contract a reader checks the body against; ETag is only for revalidation. */
export type MediaIntegrity = { sha256: string; bytes: string };

export type MediaCache = Pick<Cache, 'match' | 'put'>;

/** How a handler reaches the edge cache: the execution context that keeps a write alive past the response, and the cache itself, which tests replace. */
export type MediaServing = { ctx?: Pick<ExecutionContext, 'waitUntil'>; cache?: MediaCache };

function edgeCache(serving: MediaServing): MediaCache | undefined {
  if (serving.cache) {
    return serving.cache;
  }
  return typeof caches === 'undefined' ? undefined : caches.default;
}

function cacheKey(request: Request): Request {
  const url = new URL(request.url);
  return new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
}

function report(event: string): void {
  console.error(JSON.stringify({ event, result: 'failed' }));
}

/** The edge's copy of the answer to a `GET` or `HEAD`, with the same 304 and `HEAD` handling as a bucket read, or null when the edge has none. */
export async function cachedResponse(request: Request, serving: MediaServing): Promise<Response | null> {
  const cache = edgeCache(serving);
  if (!cache || (request.method !== 'GET' && request.method !== 'HEAD')) {
    return null;
  }
  let hit: Response | undefined;
  try {
    hit = await cache.match(cacheKey(request));
  } catch {
    report('media_cache_match');
    return null;
  }
  if (!hit) {
    return null;
  }
  const etag = hit.headers.get('ETag');
  if (etag && request.headers.get('If-None-Match') === etag) {
    await hit.body?.cancel();
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': hit.headers.get('Cache-Control') ?? '' },
    });
  }
  if (request.method === 'HEAD') {
    const headers = new Headers(hit.headers);
    await hit.body?.cancel();
    return new Response(null, { status: 200, headers });
  }
  return hit;
}

/** Keeps a copy of a `GET` 200 at the edge for the next reader and returns the response itself untouched. */
export function remembered(request: Request, response: Response, serving: MediaServing): Response {
  const cache = edgeCache(serving);
  if (!cache || request.method !== 'GET' || response.status !== 200) {
    return response;
  }
  const stored = cache.put(cacheKey(request), response.clone()).catch(() => report('media_cache_put'));
  serving.ctx?.waitUntil(stored);
  return response;
}

export function jsonError(refusal: Refusal): Response {
  return Response.json(
    { error: refusal.message },
    { status: refusal.status, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** True when the path is the namespace itself or anything under it. */
export function inNamespace(pathname: string, namespace: string): boolean {
  return pathname === namespace || pathname.startsWith(`${namespace}/`);
}

function immutableHeaders(
  object: R2Object,
  contentType: string,
  integrity: MediaIntegrity,
  cacheControl: string
): Headers {
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? contentType);
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', cacheControl);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Media-SHA256', integrity.sha256);
  headers.set('X-Media-Bytes', integrity.bytes);
  return headers;
}

/**
 * Answers a `GET` or `HEAD` for a stored object: 304 on a matching ETag, no body for `HEAD`, the bytes otherwise.
 * The cache policy is immutable unless the caller names another, as legacy URLs do because their meaning can change.
 */
export async function serveImmutable(
  request: Request,
  object: R2ObjectBody,
  contentType: string,
  integrity: MediaIntegrity,
  cacheControl = IMMUTABLE_CACHE_CONTROL
): Promise<Response> {
  if (request.headers.get('If-None-Match') === object.httpEtag) {
    await object.body.cancel();
    return new Response(null, {
      status: 304,
      headers: { ETag: object.httpEtag, 'Cache-Control': cacheControl },
    });
  }
  const headers = immutableHeaders(object, contentType, integrity, cacheControl);
  if (request.method === 'HEAD') {
    await object.body.cancel();
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
