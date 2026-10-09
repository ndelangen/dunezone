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
import { METHOD_NOT_ALLOWED, NOT_FOUND, inNamespace, jsonError, serveImmutable } from './media-response';
import type { Refusal } from './media-response';
import { authorizeBearer, readBounded, sha256Hex } from './media-upload';

const MEDIA_SOURCE_NAMESPACE = '/__media';
/** The largest original today is 4.6 MB; the bound leaves room without letting one request hold a large buffer. */
export const MEDIA_SOURCE_MAX_BYTES = 16 * 1024 * 1024;

const SOURCE_PATH = /^\/__media\/src\/([0-9a-f]{64})$/;

export type MediaSourceBucket = Pick<R2Bucket, 'get' | 'head' | 'put'>;

export type MediaSourceEnv = {
  MEDIA_SOURCE_BUCKET: MediaSourceBucket;
  /** Unset until a maintainer runs `wrangler secret put MEDIA_UPLOAD_TOKEN`; ingest refuses with 503 meanwhile. */
  MEDIA_UPLOAD_TOKEN?: string;
};

/** What ingest stored, and what the uploader records in the lock. */
type MediaSourceReceipt = {
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

/** One request on an original, named by the SHA-256 in its path. */
type Source = { request: Request; env: MediaSourceEnv; sha256: string };

/** A body that hashed to its path and parsed as a PNG or JPEG. */
type Upload = { bytes: Uint8Array; format: 'png' | 'jpeg'; width: number; height: number };

const TOO_LARGE: Refusal = { status: 413, message: 'The original is too large' };

async function authorize(source: Source): Promise<Refusal | null> {
  return await authorizeBearer(source.request, source.env.MEDIA_UPLOAD_TOKEN, 'Ingest');
}

function inspectAs(bytes: Uint8Array): Upload {
  if (bytes[0] === 0x89) {
    const { widthPx, heightPx } = pngDimensions(bytes);
    return { bytes, format: 'png', width: widthPx, height: heightPx };
  }
  const { widthPx, heightPx } = jpegProfile(bytes);
  return { bytes, format: 'jpeg', width: widthPx, height: heightPx };
}

/** Returns the parsed image, or null for anything that is not a PNG or JPEG with a non-empty area. */
function inspect(bytes: Uint8Array): Upload | null {
  try {
    const upload = inspectAs(bytes);
    return upload.width * upload.height > 0 ? upload : null;
  } catch (error) {
    if (error instanceof ImageInspectionError) {
      return null;
    }
    throw error;
  }
}

async function readUpload(source: Source): Promise<Upload | Refusal> {
  const bytes = await readBounded(source.request, MEDIA_SOURCE_MAX_BYTES);
  if (!bytes) {
    return TOO_LARGE;
  }
  if (bytes.byteLength === 0) {
    return { status: 400, message: 'The body is empty' };
  }
  const actual = await sha256Hex(bytes);
  if (actual !== source.sha256) {
    return { status: 422, message: `The body hashes to ${actual}, not the SHA-256 in the path` };
  }
  return inspect(bytes) ?? { status: 415, message: 'The original is not a readable PNG or JPEG' };
}

/** Describes what R2 holds, or returns null when its metadata does not describe this upload. */
function receiptFrom(stored: R2Object, source: Source, upload: Upload): Omit<MediaSourceReceipt, 'created'> | null {
  const metadata = stored.customMetadata ?? {};
  const format = metadata.format;
  if (metadata.sha256 !== source.sha256 || stored.size !== upload.bytes.byteLength) {
    return null;
  }
  if (format !== 'png' && format !== 'jpeg') {
    return null;
  }
  return {
    sha256: source.sha256,
    bytes: stored.size,
    width: Number(metadata.width),
    height: Number(metadata.height),
    format,
  };
}

async function serveSource(source: Source): Promise<Response> {
  const object = await source.env.MEDIA_SOURCE_BUCKET.get(mediaSourceKey(source.sha256));
  if (!object) {
    return jsonError(NOT_FOUND);
  }
  return await serveImmutable(source.request, object, 'application/octet-stream', {
    sha256: object.customMetadata?.sha256 ?? source.sha256,
    bytes: object.customMetadata?.bytes ?? String(object.size),
  });
}

async function storeUpload(source: Source, upload: Upload): Promise<Response> {
  const key = mediaSourceKey(source.sha256);
  const written = await source.env.MEDIA_SOURCE_BUCKET.put(key, upload.bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256: source.sha256,
    httpMetadata: { contentType: upload.format === 'png' ? 'image/png' : 'image/jpeg' },
    customMetadata: {
      sha256: source.sha256,
      bytes: String(upload.bytes.byteLength),
      format: upload.format,
      width: String(upload.width),
      height: String(upload.height),
    },
  });
  /* A null answer means the precondition failed: the key already exists. Content addressing makes that the same original, which the stored metadata confirms. */
  const stored = written ?? (await source.env.MEDIA_SOURCE_BUCKET.head(key));
  if (!stored) {
    return jsonError({ status: 503, message: 'The original was neither written nor found' });
  }
  const receipt = receiptFrom(stored, source, upload);
  if (!receipt) {
    console.error(JSON.stringify({ event: 'media_source_conflict', sha256: source.sha256 }));
    return jsonError({ status: 409, message: 'A stored object at this hash disagrees with the upload' });
  }
  const created = written !== null;
  return Response.json({ ...receipt, created } satisfies MediaSourceReceipt, {
    status: created ? 201 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function ingestSource(source: Source): Promise<Response> {
  const refusal = await authorize(source);
  if (refusal) {
    return jsonError(refusal);
  }
  const upload = await readUpload(source);
  if ('status' in upload) {
    return jsonError(upload);
  }
  return await storeUpload(source, upload);
}

/** Answers the `/__media` namespace, or returns null for any other path. */
export async function handleMediaSourceRequest(request: Request, env: MediaSourceEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!inNamespace(url.pathname, MEDIA_SOURCE_NAMESPACE)) {
    return null;
  }
  const sha256 = url.pathname.match(SOURCE_PATH)?.[1];
  if (!sha256) {
    return jsonError(NOT_FOUND);
  }
  const source = { request, env, sha256 };
  if (request.method === 'GET' || request.method === 'HEAD') {
    return await serveSource(source);
  }
  if (request.method === 'PUT') {
    return await ingestSource(source);
  }
  return jsonError(METHOD_NOT_ALLOWED);
}
