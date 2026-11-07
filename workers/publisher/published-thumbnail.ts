import {
  PUBLISHED_THUMBNAIL_PARAM,
  publishedImageTarget,
  publishedThumbnailWidth,
} from '../../src/shared/asset-publishing/publishedThumbnail';
import type { PublicAssetCache } from './delivery';

const THUMBNAIL_QUALITY = 82;
const CLIENT_CACHE_CONTROL = 'public, max-age=3600';
const INTERNAL_CACHE_CONTROL = 'public, max-age=31536000';

type ThumbnailDependencies = {
  images: Pick<ImagesBinding, 'input'>;
  cache?: PublicAssetCache;
};

/** The original's own request: the same URL without the width, and none of the caller's conditions or range, so it answers with the whole file. */
function originalRequest(url: URL): Request {
  const original = new URL(url);
  original.searchParams.delete(PUBLISHED_THUMBNAIL_PARAM);
  return new Request(original.toString(), { method: 'GET' });
}

/* One cache entry per original representation, so a republished image never serves an older resize. */
function thumbnailCacheKey(url: URL, width: number, etag: string): Request {
  const key = new URL(url.origin);
  key.pathname = url.pathname;
  key.searchParams.set(PUBLISHED_THUMBNAIL_PARAM, String(width));
  key.searchParams.set('etag', etag);
  return new Request(key.toString(), { method: 'GET' });
}

function notModified(request: Request, etag: string): boolean {
  const header = request.headers.get('If-None-Match');
  return Boolean(header?.split(',').some((value) => value.trim() === '*' || value.trim().replace(/^W\//, '') === etag));
}

function deliver(request: Request, body: ArrayBuffer, headers: Headers): Response {
  const etag = headers.get('ETag');
  if (etag && notModified(request, etag)) {
    return new Response(null, { status: 304, headers });
  }
  headers.set('Content-Length', String(body.byteLength));
  return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers });
}

/**
 * A published image resized to one of the listed widths, for `?w=` on its public URL;
 * null for any other request.
 * The original comes through the ordinary delivery (`original`), so availability, component resolution and its edge cache stay exactly as they are.
 * The resize is WebP, made once per original and width and kept at the edge under the original's ETag.
 * A resize that fails serves the original's bytes, so a lapsed transformation allowance degrades to today's download rather than a broken image.
 */
export async function handlePublishedThumbnailRequest(
  request: Request,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  original: (request: Request) => Promise<Response | null>,
  dependencies: ThumbnailDependencies
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.searchParams.has(PUBLISHED_THUMBNAIL_PARAM) || !publishedImageTarget(url.pathname)) {
    return null;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null;
  }
  const width = publishedThumbnailWidth(url.searchParams.get(PUBLISHED_THUMBNAIL_PARAM));
  if (width === null) {
    return new Response('Unsupported Width', { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const source = await original(originalRequest(url));
  const sourceTag = source?.headers.get('ETag')?.replace(/^W\//, '');
  if (!source || source.status !== 200 || !source.body || !sourceTag) {
    return source;
  }

  const headers = new Headers({
    'Cache-Control': CLIENT_CACHE_CONTROL,
    'Content-Type': 'image/webp',
    ETag: `"${width}-${sourceTag.replaceAll('"', '')}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  const lastModified = source.headers.get('Last-Modified');
  if (lastModified) {
    headers.set('Last-Modified', lastModified);
  }
  const allowOrigin = source.headers.get('Access-Control-Allow-Origin');
  if (allowOrigin) {
    headers.set('Access-Control-Allow-Origin', allowOrigin);
  }

  const cache = dependencies.cache ?? caches.default;
  const cacheKey = thumbnailCacheKey(url, width, sourceTag);
  const hit = await cache.match(cacheKey).catch(() => undefined);
  if (hit) {
    await source.body.cancel().catch(() => undefined);
    return deliver(request, await hit.arrayBuffer(), headers);
  }

  const bytes = await source.arrayBuffer();
  let resized: ArrayBuffer;
  try {
    const input = new Response(bytes).body!;
    const result = await dependencies.images
      .input(input)
      .transform({ width, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: THUMBNAIL_QUALITY });
    resized = await new Response(result.image()).arrayBuffer();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'publisher.thumbnail_failed',
        path: url.pathname,
        width,
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return deliver(request, bytes, new Headers(source.headers));
  }

  const stored = new Response(resized, {
    headers: { 'Cache-Control': INTERNAL_CACHE_CONTROL, 'Content-Type': 'image/webp' },
  });
  ctx.waitUntil(cache.put(cacheKey, stored).catch(() => undefined));
  return deliver(request, resized, headers);
}
