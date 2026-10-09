/**
 * Legacy raster URLs (#1888 step 7): `/image/...` and `/web/...` at their canonical names and `-small`, `-large` or `-print` tiers.
 *
 * Published rulebook HTML, CSS and saved documents embed these URLs, so they must keep working once static media leaves the deploy.
 * A URL the raster lock lists is answered with 200 from the variant it stands for in R2, never a redirect, cached for an hour because the lock can point it at a new original.
 * Everything else under those prefixes, such as committed SVGs or a raster not yet published, comes from the release's static files, and the SPA fallback's HTML is refused as a 404.
 */
import { legacyVariant } from '../../src/shared/media/legacyVariant';
import { CONTENT_TYPES, mediaVariantKey } from './media';
import { METHOD_NOT_ALLOWED, NOT_FOUND, inNamespace, jsonError, serveImmutable } from './media-response';

const LEGACY_NAMESPACES = ['/image', '/web'];
const LEGACY_CACHE_CONTROL = 'public, max-age=3600';

export type LegacyMediaEnv = {
  MEDIA_BUCKET: Pick<R2Bucket, 'get'>;
  ASSETS: Pick<Fetcher, 'fetch'>;
};

async function publishedVariant(request: Request, env: LegacyMediaEnv, name: string): Promise<Response | null> {
  const object = await env.MEDIA_BUCKET.get(mediaVariantKey(name));
  if (!object) {
    return null;
  }
  const { sha256, bytes } = object.customMetadata ?? {};
  if (!sha256 || !bytes) {
    await object.body.cancel();
    console.error(JSON.stringify({ event: 'media_variant_unverifiable', key: name }));
    return null;
  }
  const extension = name.split('.').at(-1) ?? '';
  return await serveImmutable(request, object, CONTENT_TYPES[extension], { sha256, bytes }, LEGACY_CACHE_CONTROL);
}

async function staticFile(request: Request, env: LegacyMediaEnv): Promise<Response> {
  const response = await env.ASSETS.fetch(request);
  if (response.headers.get('Content-Type')?.split(';')[0] === 'text/html') {
    await response.body?.cancel();
    return jsonError(NOT_FOUND);
  }
  return response;
}

/** Answers `/image` and `/web`, or returns null for any other path. */
export async function handleLegacyMediaRequest(request: Request, env: LegacyMediaEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!LEGACY_NAMESPACES.some((namespace) => inNamespace(pathname, namespace))) {
    return null;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(METHOD_NOT_ALLOWED);
  }
  const name = legacyVariant(pathname);
  return (name ? await publishedVariant(request, env, name) : null) ?? (await staticFile(request, env));
}

/** A fetcher over the legacy media URLs for code that loads artwork by key, such as rulebook illustrations. */
export function mediaFetcher(env: LegacyMediaEnv): Pick<Fetcher, 'fetch'> {
  return {
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      return (await handleLegacyMediaRequest(request, env)) ?? (await env.ASSETS.fetch(request));
    },
  } as Pick<Fetcher, 'fetch'>;
}
