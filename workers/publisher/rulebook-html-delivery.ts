import {
  rulebookEditionArtifactKey,
  rulebookEditionArtifactPath,
  rulebookLatestHtmlPath,
} from '../../src/shared/rulebooks/editionArtifacts';
import type { RulebookHtmlRoute } from '../../src/shared/rulebooks/editionArtifacts';
import type { ConvexPublisherClient } from './convex';
import type { PublicAssetBucket } from './delivery';

type RulebookHtmlDeliveryClient = Pick<ConvexPublisherClient, 'resolveRulebookHtmlDelivery'>;

const EDITION_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const LATEST_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const CONTENT_SECURITY_POLICY =
  "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function response(status: number, message: string, headers?: HeadersInit) {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...Object.fromEntries(new Headers(headers)),
    },
  });
}

function notModified(request: Request, etag: string) {
  const condition = request.headers.get('If-None-Match');
  if (!condition) {
    return false;
  }
  return condition
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === etag);
}

function htmlHeaders(object: R2Object, route: RulebookHtmlRoute, publicBaseUrl: string, editionNumber: number) {
  const canonicalPath = rulebookLatestHtmlPath(route.rulebookId);
  const headers = new Headers();
  headers.set('Cache-Control', route.kind === 'edition' ? EDITION_CACHE_CONTROL : LATEST_CACHE_CONTROL);
  headers.set('Content-Disposition', 'inline; filename="rulebook.html"');
  headers.set('Content-Length', String(object.size));
  headers.set('Content-Location', rulebookEditionArtifactPath(route.rulebookId, editionNumber, 'html'));
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('Link', `<${new URL(canonicalPath, publicBaseUrl)}>; rel="canonical"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  if (route.kind === 'edition') {
    headers.set('X-Robots-Tag', 'noindex');
  }
  return headers;
}

/** Resolves the latest ready Edition on every request, then streams its immutable R2 object. */
export async function handleRulebookHtmlRequest(
  request: Request,
  route: RulebookHtmlRoute,
  dependencies: {
    bucket: PublicAssetBucket;
    client: RulebookHtmlDeliveryClient;
    publicBaseUrl: string;
  }
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return response(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let resolution;
  try {
    resolution = await dependencies.client.resolveRulebookHtmlDelivery(route);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (resolution.status === 'missing') {
    return response(404, 'Not Found');
  }

  const expectedKey = rulebookEditionArtifactKey(route.rulebookId, resolution.editionNumber, 'html');
  if (resolution.key !== expectedKey) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }

  let metadata: R2Object | null;
  try {
    metadata = await dependencies.bucket.head(expectedKey);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (!metadata) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }

  let headers: Headers;
  try {
    headers = htmlHeaders(metadata, route, dependencies.publicBaseUrl, resolution.editionNumber);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (notModified(request, metadata.httpEtag)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await dependencies.bucket.get(expectedKey, {
      onlyIf: { etagMatches: metadata.etag },
    });
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (!object || !('body' in object) || object.etag !== metadata.etag) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  return new Response(object.body, { status: 200, headers });
}
