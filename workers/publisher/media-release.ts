/**
 * The media release ledger in R2 (#1888): one immutable record per release in the private `dunezone-media-releases` bucket.
 *
 * `PUT /__media/releases/<release-id>` writes the `prepared` record at `releases/<release-id>.json`.
 * It lists every variant the release serves, with its key, source SHA-256, output SHA-256 and byte length, and retention reads it to decide what must never be deleted.
 * `PUT /__media/releases/<release-id>/deployed` then writes the `deployed` marker at `releases/<release-id>.deployed`, and only once the record exists.
 * The release id is the deployed commit SHA and the workflow run ID, such as `<40hex>-<run>`.
 *
 * Both writes take the publish token, create the object only if it is absent, and answer 200 for an identical repeat.
 * A record with different contents is a 409 and is never overwritten.
 * There is no read route: the ledger is read with wrangler, never through the public origin.
 */
import { METHOD_NOT_ALLOWED, NOT_FOUND, inNamespace, jsonError } from './media-response';
import type { Refusal } from './media-response';
import { authorizeBearer, readBounded, sha256Hex } from './media-upload';

const MEDIA_RELEASE_NAMESPACE = '/__media/releases';
const RELEASE_PATH = /^\/__media\/releases\/([0-9a-f]{40}-[0-9]{1,20})(\/deployed)?$/;
const VARIANT_NAME = /^[0-9a-f]{20}\.[0-9a-f]{10}\.(png|jpg|webp)$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** About 200 bytes per variant, so this leaves room for tens of thousands of them. */
const MEDIA_RELEASE_MAX_BYTES = 16 * 1024 * 1024;

type MediaReleaseBucket = Pick<R2Bucket, 'head' | 'put'>;

export type MediaReleaseEnv = {
  MEDIA_RELEASES_BUCKET: MediaReleaseBucket;
  MEDIA_PUBLISH_TOKEN?: string;
};

/** One variant a release serves. */
type MediaReleaseVariant = { name: string; key: string; source: string; sha256: string; bytes: number };

/** What `PUT /__media/releases/<release-id>` accepts. */
export type MediaReleaseRecord = {
  schemaVersion: 1;
  release: string;
  state: 'prepared';
  variants: MediaReleaseVariant[];
};

type MediaReleaseReceipt = { release: string; object: string; sha256: string; created: boolean };

export function mediaReleaseKey(release: string): string {
  return `releases/${release}.json`;
}

export function mediaReleaseMarkerKey(release: string): string {
  return `releases/${release}.deployed`;
}

/** One request on a release, named by the id in its path. */
type Release = { request: Request; env: MediaReleaseEnv; release: string };

function isVariant(value: unknown): value is MediaReleaseVariant {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const variant = value as Record<string, unknown>;
  return (
    typeof variant.name === 'string' &&
    VARIANT_NAME.test(variant.name) &&
    typeof variant.key === 'string' &&
    variant.key.startsWith('/') &&
    typeof variant.source === 'string' &&
    SHA256.test(variant.source) &&
    variant.name.startsWith(variant.source.slice(0, 20)) &&
    typeof variant.sha256 === 'string' &&
    SHA256.test(variant.sha256) &&
    Number.isSafeInteger(variant.bytes) &&
    (variant.bytes as number) > 0
  );
}

/** Returns the reason a record is unacceptable for this release, or null when it is well formed. */
function recordProblem(value: unknown, release: string): string | null {
  if (!value || typeof value !== 'object') {
    return 'The record is not a JSON object';
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1 || record.state !== 'prepared') {
    return 'The record must be schemaVersion 1 in the prepared state';
  }
  if (record.release !== release) {
    return 'The record names a different release than its path';
  }
  if (!Array.isArray(record.variants) || record.variants.length === 0) {
    return 'The record lists no variants';
  }
  return record.variants.every(isVariant) ? null : 'A variant entry is malformed';
}

async function readRecord(source: Release): Promise<Uint8Array | Refusal> {
  const bytes = await readBounded(source.request, MEDIA_RELEASE_MAX_BYTES);
  if (!bytes) {
    return { status: 413, message: 'The record is too large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { status: 400, message: 'The record is not valid JSON' };
  }
  const problem = recordProblem(parsed, source.release);
  return problem ? { status: 422, message: problem } : bytes;
}

/** Creates the object only if it is absent, then confirms whatever R2 holds there has these exact bytes. */
async function createOnce(source: Release, key: string, bytes: Uint8Array): Promise<Response> {
  const sha256 = await sha256Hex(bytes);
  const bucket = source.env.MEDIA_RELEASES_BUCKET;
  const written = await bucket.put(key, bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256,
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { sha256, bytes: String(bytes.byteLength) },
  });
  const stored = written ?? (await bucket.head(key));
  if (!stored) {
    return jsonError({ status: 503, message: 'The release object was neither written nor found' });
  }
  if (stored.customMetadata?.sha256 !== sha256 || stored.size !== bytes.byteLength) {
    console.error(JSON.stringify({ event: 'media_release_conflict', key }));
    return jsonError({ status: 409, message: 'A stored release object here has different contents' });
  }
  const created = written !== null;
  return Response.json({ release: source.release, object: key, sha256, created } satisfies MediaReleaseReceipt, {
    status: created ? 201 : 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function prepareRelease(source: Release): Promise<Response> {
  const record = await readRecord(source);
  if ('status' in record) {
    return jsonError(record);
  }
  return await createOnce(source, mediaReleaseKey(source.release), record);
}

/** The marker names its record's SHA-256, so it can only ever confirm the record that was prepared. */
async function markDeployed(source: Release): Promise<Response> {
  const record = await source.env.MEDIA_RELEASES_BUCKET.head(mediaReleaseKey(source.release));
  const recordSha256 = record?.customMetadata?.sha256;
  if (!recordSha256) {
    return jsonError({ status: 409, message: 'The release has no prepared record' });
  }
  const marker = new TextEncoder().encode(
    JSON.stringify({ schemaVersion: 1, release: source.release, state: 'deployed', record: recordSha256 })
  );
  return await createOnce(source, mediaReleaseMarkerKey(source.release), marker);
}

/** Answers `/__media/releases`, or returns null for any other path. */
export async function handleMediaReleaseRequest(request: Request, env: MediaReleaseEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!inNamespace(url.pathname, MEDIA_RELEASE_NAMESPACE)) {
    return null;
  }
  const match = url.pathname.match(RELEASE_PATH);
  if (!match) {
    return jsonError(NOT_FOUND);
  }
  if (request.method !== 'PUT') {
    return jsonError(METHOD_NOT_ALLOWED);
  }
  const refusal = await authorizeBearer(request, env.MEDIA_PUBLISH_TOKEN, 'Publishing');
  if (refusal) {
    return jsonError(refusal);
  }
  const source = { request, env, release: match[1] };
  return match[2] ? await markDeployed(source) : await prepareRelease(source);
}
