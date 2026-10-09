/**
 * Encoded raster variants in R2 (#1888): one object per variant at `v/<src20>.<recipe10>.<ext>` in `dunezone-media`.
 *
 * `GET`/`HEAD /m/<src20>.<recipe10>.<ext>` serves a variant under an immutable URL.
 * `src20` is the first 20 hex digits of the original's SHA-256 and `recipe10` names the encoding recipe, so a key never changes meaning.
 * Only the encoder writes this bucket, never the Worker.
 * A variant whose stored metadata lacks its output SHA-256 and byte length is refused, because readers verify every body against them.
 */
import { METHOD_NOT_ALLOWED, NOT_FOUND, inNamespace, jsonError, serveImmutable } from './media-response';

const MEDIA_VARIANT_NAMESPACE = '/m';
const VARIANT_PATH = /^\/m\/([0-9a-f]{20}\.[0-9a-f]{10}\.(png|jpg|webp))$/;

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
};

export type MediaVariantBucket = Pick<R2Bucket, 'get'>;

export type MediaVariantEnv = { MEDIA_BUCKET: MediaVariantBucket };

export function mediaVariantKey(name: string): string {
  return `v/${name}`;
}

async function serveVariant(request: Request, env: MediaVariantEnv, name: string, extension: string) {
  const object = await env.MEDIA_BUCKET.get(mediaVariantKey(name));
  if (!object) {
    return jsonError(NOT_FOUND);
  }
  const { sha256, bytes } = object.customMetadata ?? {};
  if (!sha256 || !bytes) {
    await object.body.cancel();
    console.error(JSON.stringify({ event: 'media_variant_unverifiable', key: name }));
    return jsonError({ status: 502, message: 'The stored variant has no integrity metadata' });
  }
  return await serveImmutable(request, object, CONTENT_TYPES[extension], { sha256, bytes });
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
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(METHOD_NOT_ALLOWED);
  }
  return await serveVariant(request, env, match[1], match[2]);
}
