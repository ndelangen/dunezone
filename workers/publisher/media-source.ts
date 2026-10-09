/**
 * The raster originals' store in R2 (#1888): one object per original at `sha256/<64hex>` in `dunezone-media-src`.
 *
 * `GET`/`HEAD /__media/src/<sha256>` is the read path for CI fills and `media:sync` pulls.
 * It needs no credential and serves only what ingest stored, so a caller cannot introduce a hash.
 * `PUT /__media/src/<sha256>` is the maintainer-only ingest.
 * It takes the upload token as a bearer token, re-hashes the body, accepts only PNG or JPEG, reads the dimensions from the header and creates the object only if it is absent.
 * An identical re-upload answers 200, so a backfill or a retried upload is safe to repeat.
 */
import { ImageInspectionError, jpegProfile, pngDimensions } from './image-inspection';

export const MEDIA_SOURCE_NAMESPACE = '/__media';
export const MEDIA_SOURCE_PREFIX = '/__media/src/';
/** The largest original today is 4.6 MB; the bound leaves room without letting one request hold a large buffer. */
export const MEDIA_SOURCE_MAX_BYTES = 16 * 1024 * 1024;

const SOURCE_PATH = /^\/__media\/src\/([0-9a-f]{64})$/;
const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export type MediaSourceBucket = Pick<R2Bucket, 'get' | 'head' | 'put'>;

export type MediaSourceEnv = {
  MEDIA_SOURCE_BUCKET: MediaSourceBucket;
  /** Unset until a maintainer runs `wrangler secret put MEDIA_UPLOAD_TOKEN`; ingest refuses with 503 meanwhile. */
  MEDIA_UPLOAD_TOKEN?: string;
};

/** What ingest stored, and what the uploader records in the lock. */
export type MediaSourceReceipt = {
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  format: 'png' | 'jpeg';
  created: boolean;
};

export function mediaSourceKey(sha256: string): string {
  return `sha256/${sha256}`;
}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compares digests rather than the secrets themselves, so the comparison takes the same time whatever the lengths. */
async function tokenMatches(presented: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(presented)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

/** Reads at most `limit` bytes and returns null past it, whatever Content-Length claimed. */
async function readBounded(request: Request, limit: number): Promise<Uint8Array | null> {
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type Inspected = { format: 'png' | 'jpeg'; width: number; height: number };

function inspect(bytes: Uint8Array): Inspected | null {
  try {
    if (bytes[0] === 0x89) {
      const { widthPx, heightPx } = pngDimensions(bytes);
      return { format: 'png', width: widthPx, height: heightPx };
    }
    const { widthPx, heightPx } = jpegProfile(bytes);
    return { format: 'jpeg', width: widthPx, height: heightPx };
  } catch (error) {
    if (error instanceof ImageInspectionError) {
      return null;
    }
    throw error;
  }
}

function sourceHeaders(object: R2Object, sha256: string): Headers {
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType ?? 'application/octet-stream');
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Media-SHA256', object.customMetadata?.sha256 ?? sha256);
  headers.set('X-Media-Bytes', object.customMetadata?.bytes ?? String(object.size));
  return headers;
}

function receiptFrom(sha256: string, object: R2Object, created: boolean): MediaSourceReceipt | null {
  const metadata = object.customMetadata ?? {};
  const format = metadata.format;
  if (metadata.sha256 !== sha256 || (format !== 'png' && format !== 'jpeg')) {
    return null;
  }
  return {
    sha256,
    bytes: object.size,
    width: Number(metadata.width),
    height: Number(metadata.height),
    format,
    created,
  };
}

async function serveSource(request: Request, env: MediaSourceEnv, sha256: string): Promise<Response> {
  const object = await env.MEDIA_SOURCE_BUCKET.get(mediaSourceKey(sha256));
  if (!object) {
    return jsonError(404, 'Not found');
  }
  const headers = sourceHeaders(object, sha256);
  if (request.headers.get('If-None-Match') === object.httpEtag) {
    await object.body.cancel();
    return new Response(null, { status: 304, headers: { ETag: object.httpEtag } });
  }
  if (request.method === 'HEAD') {
    await object.body.cancel();
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}

async function ingestSource(request: Request, env: MediaSourceEnv, sha256: string): Promise<Response> {
  if (!env.MEDIA_UPLOAD_TOKEN) {
    return jsonError(503, 'Ingest is not configured');
  }
  const presented = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!presented || !(await tokenMatches(presented, env.MEDIA_UPLOAD_TOKEN))) {
    return jsonError(401, 'Not authorized');
  }
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > MEDIA_SOURCE_MAX_BYTES) {
    return jsonError(413, 'The original is too large');
  }
  const bytes = await readBounded(request, MEDIA_SOURCE_MAX_BYTES);
  if (!bytes) {
    return jsonError(413, 'The original is too large');
  }
  if (bytes.byteLength === 0) {
    return jsonError(400, 'The body is empty');
  }
  const actual = hex(await crypto.subtle.digest('SHA-256', bytes));
  if (actual !== sha256) {
    return jsonError(422, `The body hashes to ${actual}, not the SHA-256 in the path`);
  }
  const inspected = inspect(bytes);
  if (!inspected || inspected.width === 0 || inspected.height === 0) {
    return jsonError(415, 'The original is not a readable PNG or JPEG');
  }
  const key = mediaSourceKey(sha256);
  const written = await env.MEDIA_SOURCE_BUCKET.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256,
    httpMetadata: { contentType: inspected.format === 'png' ? 'image/png' : 'image/jpeg' },
    customMetadata: {
      sha256,
      bytes: String(bytes.byteLength),
      format: inspected.format,
      width: String(inspected.width),
      height: String(inspected.height),
    },
  });
  /* A null answer means the precondition failed: the key already exists. Content addressing makes that the same original, which the stored metadata confirms. */
  const stored = written ?? (await env.MEDIA_SOURCE_BUCKET.head(key));
  if (!stored) {
    return jsonError(503, 'The original was neither written nor found');
  }
  const receipt = receiptFrom(sha256, stored, written !== null);
  if (!receipt || receipt.bytes !== bytes.byteLength) {
    console.error(JSON.stringify({ event: 'media_source_conflict', sha256 }));
    return jsonError(409, 'A stored object at this hash disagrees with the upload');
  }
  return Response.json(receipt, { status: receipt.created ? 201 : 200, headers: { 'Cache-Control': 'no-store' } });
}

/** Answers the `/__media` namespace, or returns null for any other path. */
export async function handleMediaSourceRequest(request: Request, env: MediaSourceEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== MEDIA_SOURCE_NAMESPACE && !url.pathname.startsWith(`${MEDIA_SOURCE_NAMESPACE}/`)) {
    return null;
  }
  const sha256 = url.pathname.match(SOURCE_PATH)?.[1];
  if (!sha256) {
    return jsonError(404, 'Not found');
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    return await serveSource(request, env, sha256);
  }
  if (request.method === 'PUT') {
    return await ingestSource(request, env, sha256);
  }
  return jsonError(405, 'Method not allowed');
}
