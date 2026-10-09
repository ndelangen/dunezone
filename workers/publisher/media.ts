/**
 * Encoded raster variants in R2 (#1888): one object per variant at `v/<src20>.<recipe10>.<ext>` in `dunezone-media`.
 *
 * `GET`/`HEAD /m/<src20>.<recipe10>.<ext>` serves a variant under an immutable URL.
 * `src20` is the first 20 hex digits of the original's SHA-256 and `recipe10` names the encoding recipe, so a key never changes meaning.
 * A variant whose stored metadata lacks its output SHA-256 and byte length is refused, because readers verify every body against them.
 *
 * `PUT /m/<src20>.<recipe10>.<ext>` is how the production deploy publishes what CI encoded (#1888 step 4).
 * It takes the publish token as a bearer token, checks that the body is the image type its extension names, records the body's SHA-256 and length, and creates the object only if it is absent.
 * An identical re-publish answers 200.
 * A stored object whose bytes differ is a 409 and is never overwritten.
 *
 * A name R2 lacks is served from the release's own `m/` static files when the release bundles it, as local and CI Workers do with empty buckets (#1888 step 5).
 * Such a response carries no integrity headers, so the deploy's parity check still fails for a variant that was never published.
 */
import { METHOD_NOT_ALLOWED, NOT_FOUND, inNamespace, jsonError, serveImmutable } from './media-response';
import type { Refusal } from './media-response';
import { authorizeBearer, readBounded, sha256Hex } from './media-upload';

const MEDIA_VARIANT_NAMESPACE = '/m';
const VARIANT_PATH = /^\/m\/([0-9a-f]{20}\.[0-9a-f]{10}\.(png|jpg|webp))$/;

export const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

/** The largest variant today is under 1 MB. */
export const MEDIA_VARIANT_MAX_BYTES = 8 * 1024 * 1024;

type MediaVariantBucket = Pick<R2Bucket, 'get' | 'head' | 'put'>;

export type MediaVariantEnv = {
  MEDIA_BUCKET: MediaVariantBucket;
  /** Set by each production deploy (`wrangler deploy --secrets-file`); publishing refuses with 503 while it is unset. */
  MEDIA_PUBLISH_TOKEN?: string;
  /** The release's static files; consulted only for a name R2 lacks. */
  ASSETS?: Pick<Fetcher, 'fetch'>;
};

/** What the Worker stored, and what the publisher checks against its own record. */
type MediaVariantReceipt = { name: string; sha256: string; bytes: number; created: boolean };

export function mediaVariantKey(name: string): string {
  return `v/${name}`;
}

async function serveVariant(request: Request, env: MediaVariantEnv, name: string, extension: string) {
  const object = await env.MEDIA_BUCKET.get(mediaVariantKey(name));
  if (!object) {
    return (await bundledVariant(request, env, name, extension)) ?? jsonError(NOT_FOUND);
  }
  const { sha256, bytes } = object.customMetadata ?? {};
  if (!sha256 || !bytes) {
    await object.body.cancel();
    console.error(JSON.stringify({ event: 'media_variant_unverifiable', key: name }));
    return jsonError({ status: 502, message: 'The stored variant has no integrity metadata' });
  }
  return await serveImmutable(request, object, CONTENT_TYPES[extension], { sha256, bytes });
}

/** The release's static copy of a variant, or null when it bundles none: the SPA fallback answers HTML, never the image type. */
async function bundledVariant(request: Request, env: MediaVariantEnv, name: string, extension: string) {
  if (!env.ASSETS) {
    return null;
  }
  const url = new URL(`/m/${name}`, request.url);
  const response = await env.ASSETS.fetch(new Request(url, { method: request.method }));
  if (response.status !== 200 || response.headers.get('Content-Type')?.split(';')[0] !== CONTENT_TYPES[extension]) {
    await response.body?.cancel();
    return null;
  }
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(request.method === 'HEAD' ? null : response.body, { status: 200, headers });
}

/** True when the bytes open with the signature of the image type the extension names. */
function signatureMatches(bytes: Uint8Array, extension: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (extension === 'png') {
    return bytes[0] === 0x89 && ascii(1, 8) === 'PNG\r\n\x1a\n';
  }
  if (extension === 'jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
}

async function readVariant(request: Request, extension: string): Promise<Uint8Array | Refusal> {
  const bytes = await readBounded(request, MEDIA_VARIANT_MAX_BYTES);
  if (!bytes) {
    return { status: 413, message: 'The variant is too large' };
  }
  if (bytes.byteLength === 0) {
    return { status: 400, message: 'The body is empty' };
  }
  return signatureMatches(bytes, extension)
    ? bytes
    : { status: 415, message: `The body is not the ${extension} the name declares` };
}

async function publishVariant(request: Request, env: MediaVariantEnv, name: string, extension: string) {
  const refusal = await authorizeBearer(request, env.MEDIA_PUBLISH_TOKEN, 'Publishing');
  if (refusal) {
    return jsonError(refusal);
  }
  const bytes = await readVariant(request, extension);
  if ('status' in bytes) {
    return jsonError(bytes);
  }
  const sha256 = await sha256Hex(bytes);
  const key = mediaVariantKey(name);
  const written = await env.MEDIA_BUCKET.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256,
    httpMetadata: { contentType: CONTENT_TYPES[extension] },
    customMetadata: { sha256, bytes: String(bytes.byteLength) },
  });
  /* A null answer means the key already exists. The name is not a hash of the bytes, so the stored metadata decides whether it is the same variant. */
  const stored = written ?? (await env.MEDIA_BUCKET.head(key));
  if (!stored) {
    return jsonError({ status: 503, message: 'The variant was neither written nor found' });
  }
  if (stored.customMetadata?.sha256 !== sha256 || stored.size !== bytes.byteLength) {
    console.error(JSON.stringify({ event: 'media_variant_conflict', key: name }));
    return jsonError({ status: 409, message: 'A stored variant with this name has different bytes' });
  }
  const created = written !== null;
  return Response.json({ name, sha256, bytes: bytes.byteLength, created } satisfies MediaVariantReceipt, {
    status: created ? 201 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/** Answers the `/m` namespace, or returns null for any other path. */
export async function handleMediaVariantRequest(request: Request, env: MediaVariantEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!inNamespace(url.pathname, MEDIA_VARIANT_NAMESPACE)) {
    return null;
  }
  const match = url.pathname.match(VARIANT_PATH);
  if (!match) {
    return jsonError(NOT_FOUND);
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return await serveVariant(request, env, match[1], match[2]);
  }
  if (request.method === 'PUT') {
    return await publishVariant(request, env, match[1], match[2]);
  }
  return jsonError(METHOD_NOT_ALLOWED);
}
