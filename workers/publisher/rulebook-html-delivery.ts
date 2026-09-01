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
const SUPPORTED_METHODS = new Set(['GET', 'HEAD']);

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

function notModified(request: Request, metadata: R2Object) {
  const condition = request.headers.get('If-None-Match');
  if (!condition) {
    return false;
  }
  return condition
    .split(',')
    .map((value) => value.trim().replace(/^W\//, ''))
    .some((value) => value === '*' || value === metadata.httpEtag);
}

type DeliveryIdentity = {
  editionNumber: number;
  key: string;
  publicBaseUrl: string;
  route: RulebookHtmlRoute;
};

function htmlHeaders(object: R2Object, identity: DeliveryIdentity) {
  const canonicalPath = rulebookLatestHtmlPath(identity.route.rulebookId);
  const headers = new Headers();
  headers.set('Cache-Control', identity.route.kind === 'edition' ? EDITION_CACHE_CONTROL : LATEST_CACHE_CONTROL);
  headers.set('Content-Disposition', 'inline; filename="rulebook.html"');
  headers.set('Content-Length', String(object.size));
  headers.set(
    'Content-Location',
    rulebookEditionArtifactPath(identity.route.rulebookId, identity.editionNumber, 'html')
  );
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('Link', `<${new URL(canonicalPath, identity.publicBaseUrl)}>; rel="canonical"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  if (identity.route.kind === 'edition') {
    headers.set('X-Robots-Tag', 'noindex');
  }
  return headers;
}

async function resolveDelivery(client: RulebookHtmlDeliveryClient, route: RulebookHtmlRoute) {
  try {
    return await client.resolveRulebookHtmlDelivery(route);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
}

async function loadMetadata(bucket: PublicAssetBucket, identity: DeliveryIdentity) {
  try {
    return await bucket.head(identity.key);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
}

function buildHtmlHeaders(metadata: R2Object, identity: DeliveryIdentity) {
  try {
    return htmlHeaders(metadata, identity);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
}

type PreparedDelivery = {
  headers: Headers;
  identity: DeliveryIdentity;
  metadata: R2Object;
};

async function prepareDelivery(
  route: RulebookHtmlRoute,
  dependencies: {
    bucket: PublicAssetBucket;
    client: RulebookHtmlDeliveryClient;
    publicBaseUrl: string;
  }
): Promise<PreparedDelivery | Response> {
  const resolution = await resolveDelivery(dependencies.client, route);
  if (resolution instanceof Response) {
    return resolution;
  }
  if (resolution.status === 'missing') {
    return response(404, 'Not Found');
  }
  const identity: DeliveryIdentity = {
    editionNumber: resolution.editionNumber,
    key: rulebookEditionArtifactKey(route.rulebookId, resolution.editionNumber, 'html'),
    publicBaseUrl: dependencies.publicBaseUrl,
    route,
  };
  if (resolution.key !== identity.key) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  const metadata = await loadMetadata(dependencies.bucket, identity);
  if (metadata instanceof Response) {
    return metadata;
  }
  if (!metadata) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  const headers = buildHtmlHeaders(metadata, identity);
  return headers instanceof Response ? headers : { headers, identity, metadata };
}

async function loadBody(bucket: PublicAssetBucket, prepared: PreparedDelivery) {
  try {
    return await bucket.get(prepared.identity.key, { onlyIf: { etagMatches: prepared.metadata.etag } });
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
}

function isMatchingBody(object: R2ObjectBody | R2Object | null, metadata: R2Object): object is R2ObjectBody {
  if (!object) {
    return false;
  }
  if (!('body' in object)) {
    return false;
  }
  return object.etag === metadata.etag;
}

async function servePrepared(request: Request, prepared: PreparedDelivery, bucket: PublicAssetBucket) {
  const { headers, metadata } = prepared;
  if (notModified(request, metadata)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }
  const object = await loadBody(bucket, prepared);
  if (object instanceof Response) {
    return object;
  }
  if (!isMatchingBody(object, metadata)) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  return new Response(object.body, { status: 200, headers });
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
  if (!SUPPORTED_METHODS.has(request.method)) {
    return response(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  const prepared = await prepareDelivery(route, dependencies);
  return prepared instanceof Response ? prepared : servePrepared(request, prepared, dependencies.bucket);
}
