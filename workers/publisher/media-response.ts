/**
 * Responses shared by the immutable media namespaces (#1888): `/__media/src` for originals and `/m` for variants.
 * Both serve content-addressed R2 objects, so a hit is cacheable forever and every refusal is `no-store`.
 */

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type Refusal = { status: number; message: string };

export const NOT_FOUND: Refusal = { status: 404, message: 'Not found' };
export const METHOD_NOT_ALLOWED: Refusal = { status: 405, message: 'Method not allowed' };

/** The integrity contract a reader checks the body against; ETag is only for revalidation. */
export type MediaIntegrity = { sha256: string; bytes: string };

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

function immutableHeaders(object: R2Object, contentType: string, integrity: MediaIntegrity): Headers {
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? contentType);
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Media-SHA256', integrity.sha256);
  headers.set('X-Media-Bytes', integrity.bytes);
  return headers;
}

/** Answers a `GET` or `HEAD` for a stored object: 304 on a matching ETag, no body for `HEAD`, the bytes otherwise. */
export async function serveImmutable(
  request: Request,
  object: R2ObjectBody,
  contentType: string,
  integrity: MediaIntegrity
): Promise<Response> {
  if (request.headers.get('If-None-Match') === object.httpEtag) {
    await object.body.cancel();
    return new Response(null, {
      status: 304,
      headers: { ETag: object.httpEtag, 'Cache-Control': IMMUTABLE_CACHE_CONTROL },
    });
  }
  const headers = immutableHeaders(object, contentType, integrity);
  if (request.method === 'HEAD') {
    await object.body.cancel();
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}
