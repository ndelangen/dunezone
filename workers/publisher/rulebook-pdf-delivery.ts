import { rulebookEditionArtifactKey, rulebookEditionArtifactPath } from '../../src/shared/rulebooks/editionArtifacts';
import type { RulebookPdfRoute } from '../../src/shared/rulebooks/editionArtifacts';
import type { ConvexPublisherClient } from './convex';
import type { PublicAssetBucket } from './delivery';

type RulebookPdfDeliveryClient = Pick<ConvexPublisherClient, 'resolveRulebookPdfDelivery'>;

const CACHE_CONTROL = 'public, max-age=31536000, immutable';
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
  return Boolean(
    condition
      ?.split(',')
      .map((value) => value.trim().replace(/^W\//, ''))
      .some((value) => value === '*' || value === metadata.httpEtag)
  );
}

function pdfHeaders(object: R2Object, route: RulebookPdfRoute) {
  const headers = new Headers();
  headers.set('Cache-Control', CACHE_CONTROL);
  headers.set('Content-Disposition', 'attachment; filename="rulebook.pdf"');
  headers.set('Content-Length', String(object.size));
  headers.set('Content-Location', rulebookEditionArtifactPath(route.rulebookId, route.editionNumber, 'pdf'));
  headers.set('Content-Type', 'application/pdf');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Robots-Tag', 'noindex');
  return headers;
}

/** Authorizes one immutable Edition PDF against the live Rulebook state before streaming it. */
export async function handleRulebookPdfRequest(
  request: Request,
  route: RulebookPdfRoute,
  dependencies: { bucket: PublicAssetBucket; client: RulebookPdfDeliveryClient }
): Promise<Response> {
  if (!SUPPORTED_METHODS.has(request.method)) {
    return response(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let resolution;
  try {
    resolution = await dependencies.client.resolveRulebookPdfDelivery(route);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (resolution.status === 'missing') {
    return response(404, 'Not Found');
  }
  const key = rulebookEditionArtifactKey(route.rulebookId, route.editionNumber, 'pdf');
  if (resolution.editionNumber !== route.editionNumber || resolution.key !== key) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }

  let metadata: R2Object | null;
  try {
    metadata = await dependencies.bucket.head(key);
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (!metadata) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  const headers = pdfHeaders(metadata, route);
  if (notModified(request, metadata)) {
    headers.delete('Content-Length');
    return new Response(null, { status: 304, headers });
  }
  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await dependencies.bucket.get(key, { onlyIf: { etagMatches: metadata.etag } });
  } catch {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  if (!object || !('body' in object) || object.etag !== metadata.etag) {
    return response(503, 'Rulebook Temporarily Unavailable');
  }
  return new Response(object.body, { status: 200, headers });
}
