/**
 * Legacy raster URLs (#1888 step 7): `/image/...` and `/web/...` at their canonical names and `-small`, `-large` or `-print` tiers.
 *
 * Published rulebook HTML, CSS and saved documents embed these URLs, so they must keep working once static media leaves the deploy.
 * A URL the raster lock lists is answered with 200 from the variant it stands for in R2, never a redirect, cached for an hour because the lock can point it at a new original.
 * Everything else under those prefixes, such as committed SVGs or a raster not yet published, comes from the release's static files, and the SPA fallback's HTML is refused as a 404.
 * An answer from R2 is kept in the edge cache for its hour, keyed by the URL and the variant it resolved to, so a deploy that re-points the URL is served at once.
 * Static files already come from the edge.
 */
import { readLegacyEmblemPath, LEGACY_EMBLEM_PREFIX } from '../../src/shared/legacyEmblem';
import { legacyVariant } from '../../src/shared/media/legacyVariant';
import { CONTENT_TYPES, mediaVariantKey } from './media';
import {
  METHOD_NOT_ALLOWED,
  NOT_FOUND,
  cachedResponse,
  inNamespace,
  jsonError,
  remembered,
  serveImmutable,
} from './media-response';
import type { MediaServing } from './media-response';

const LEGACY_NAMESPACES = ['/image', '/web'];
const LEGACY_CACHE_CONTROL = 'public, max-age=3600';

export type LegacyMediaEnv = {
  MEDIA_BUCKET: Pick<R2Bucket, 'get'>;
  ASSETS: Pick<Fetcher, 'fetch'>;
};

async function publishedVariant(
  request: Request,
  env: LegacyMediaEnv,
  name: string,
  serving: MediaServing
): Promise<Response | null> {
  const cached = await cachedResponse(request, serving, name);
  if (cached) {
    return cached;
  }
  let object: R2ObjectBody | null;
  try {
    object = await env.MEDIA_BUCKET.get(mediaVariantKey(name));
  } catch {
    console.error(JSON.stringify({ event: 'media_variant_read_failed', key: name }));
    const fallback = await staticFile(request, env);
    if (fallback.ok || fallback.status === 304) {
      return fallback;
    }
    await fallback.body?.cancel();
    return jsonError({ status: 503, message: 'The stored variant is temporarily unavailable' });
  }
  if (!object) {
    return null;
  }
  const { sha256, bytes } = object.customMetadata ?? {};
  if (!sha256 || !bytes) {
    await object.body.cancel();
    console.error(JSON.stringify({ event: 'media_variant_unverifiable', key: name }));
    return jsonError({ status: 502, message: 'The stored variant has no integrity metadata' });
  }
  const extension = name.split('.').at(-1) ?? '';
  const response = await serveImmutable(
    request,
    object,
    CONTENT_TYPES[extension],
    { sha256, bytes },
    LEGACY_CACHE_CONTROL
  );
  return remembered(request, response, serving, name);
}

async function staticFile(request: Request, env: LegacyMediaEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (response.headers.get('Content-Type')?.split(';')[0] === 'text/html') {
    await response.body?.cancel();
    return jsonError(NOT_FOUND);
  }
  return response;
}

/**
 * Answers a stock emblem at its pre-rename `/vector/logo/` path with the file at its `/vector/emblem/` one.
 * Published rulebook HTML and games already in storage name the old path, and an SVG `<use>` does not follow a redirect, so it is a 200 rather than a 301.
 */
async function renamedEmblem(request: Request, env: LegacyMediaEnv, url: URL): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(METHOD_NOT_ALLOWED);
  }
  const renamed = new URL(url);
  renamed.pathname = readLegacyEmblemPath(url.pathname) as string;
  return await staticFile(new Request(renamed, request), env);
}

/** Answers `/image`, `/web` and the old `/vector/logo/`, or returns null for any other path. */
export async function handleLegacyMediaRequest(
  request: Request,
  env: LegacyMediaEnv,
  serving: MediaServing = {}
): Promise<Response | null> {
  const url = new URL(request.url);
  const { pathname } = url;
  if (pathname.startsWith(LEGACY_EMBLEM_PREFIX)) {
    return await renamedEmblem(request, env, url);
  }
  if (!LEGACY_NAMESPACES.some((namespace) => inNamespace(pathname, namespace))) {
    return null;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(METHOD_NOT_ALLOWED);
  }
  const name = legacyVariant(pathname);
  return (name ? await publishedVariant(request, env, name, serving) : null) ?? (await staticFile(request, env));
}

/** A fetcher over the legacy media URLs for code that loads artwork by key, such as rulebook illustrations. */
export function mediaFetcher(env: LegacyMediaEnv, serving: MediaServing = {}): Pick<Fetcher, 'fetch'> {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      return (await handleLegacyMediaRequest(request, env, serving)) ?? (await env.ASSETS.fetch(request));
    },
  } as Pick<Fetcher, 'fetch'>;
}
