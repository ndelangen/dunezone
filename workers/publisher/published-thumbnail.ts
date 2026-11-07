import type { PublishedThumbnailWidth } from '../../src/shared/asset-publishing/publishedThumbnail';
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

/** The width a request asks for, a 400 for an unlisted one, or null for a request this handler does not own. */
function requestedWidth(request: Request, url: URL): PublishedThumbnailWidth | Response | null {
  const owned =
    url.searchParams.has(PUBLISHED_THUMBNAIL_PARAM) &&
    publishedImageTarget(url.pathname) !== null &&
    (request.method === 'GET' || request.method === 'HEAD');
  if (!owned) {
    return null;
  }
  return (
    publishedThumbnailWidth(url.searchParams.get(PUBLISHED_THUMBNAIL_PARAM)) ??
    new Response('Unsupported Width', { status: 400, headers: { 'Cache-Control': 'no-store' } })
  );
}

/** The original's ETag without its weak marker, when the original answered with a whole body to resize. */
function resizableTag(source: Response | null): string | null {
  if (source?.status !== 200 || !source.body) {
    return null;
  }
  return source.headers.get('ETag')?.replace(/^W\//, '') ?? null;
}

/** The resize's own headers, carrying over the original's date and cross-origin allowance. */
function thumbnailHeaders(source: Response, width: number, sourceTag: string): Headers {
  const headers = new Headers({
    'Cache-Control': CLIENT_CACHE_CONTROL,
    'Content-Type': 'image/webp',
    ETag: `"${width}-${sourceTag.replaceAll('"', '')}"`,
    'X-Content-Type-Options': 'nosniff',
  });
  for (const name of ['Last-Modified', 'Access-Control-Allow-Origin']) {
    const value = source.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

/** The WebP resize, or null when the Images binding refuses, which is logged. */
async function resize(
  images: ThumbnailDependencies['images'],
  bytes: ArrayBuffer,
  width: number,
  path: string
): Promise<ArrayBuffer | null> {
  try {
    const result = await images
      .input(new Response(bytes).body!)
      .transform({ width, fit: 'scale-down' })
      .output({ format: 'image/webp', quality: THUMBNAIL_QUALITY });
    return await new Response(result.image()).arrayBuffer();
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: 'publisher.thumbnail_failed',
        path,
        width,
        message: error instanceof Error ? error.message : String(error),
      })
    );
    return null;
  }
}

/** The resize kept at the edge, with the original's unread body released. */
async function keptThumbnail(source: Response, kept: Response): Promise<ArrayBuffer> {
  await source.body?.cancel().catch(() => undefined);
  return kept.arrayBuffer();
}

/** A new resize of the original, handed to `keep` for the edge; null when it fails, with the original left unread. */
async function freshThumbnail(
  source: Response,
  target: { width: number; path: string; images: ThumbnailDependencies['images'] },
  keep: (resized: Response) => void
): Promise<ArrayBuffer | null> {
  const resized = await resize(target.images, await source.clone().arrayBuffer(), target.width, target.path);
  if (resized) {
    await source.body?.cancel().catch(() => undefined);
    keep(new Response(resized, { headers: { 'Cache-Control': INTERNAL_CACHE_CONTROL, 'Content-Type': 'image/webp' } }));
  }
  return resized;
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
  const width = requestedWidth(request, url);
  if (width === null || width instanceof Response) {
    return width;
  }
  const source = await original(originalRequest(url));
  const sourceTag = resizableTag(source);
  if (!source || sourceTag === null) {
    return source;
  }
  const cache = dependencies.cache ?? caches.default;
  const cacheKey = thumbnailCacheKey(url, width, sourceTag);
  const kept = await cache.match(cacheKey).catch(() => undefined);
  const thumbnail = kept
    ? await keptThumbnail(source, kept)
    : await freshThumbnail(source, { width, path: url.pathname, images: dependencies.images }, (resized) =>
        ctx.waitUntil(cache.put(cacheKey, resized).catch(() => undefined))
      );
  return thumbnail
    ? deliver(request, thumbnail, thumbnailHeaders(source, width, sourceTag))
    : deliver(request, await source.arrayBuffer(), new Headers(source.headers));
}
