/**
 * Variant packs for local setup: the whole variant store in a handful of downloads instead of one request per variant.
 *
 * Each deploy splits the variants it serves into packs by the first hex digit of their names, so every variant of one original lands in the same pack and new art changes one pack.
 * A pack is the variants' bytes back to back, named after its own SHA-256, at `packs/<sha256>.bin` in `dunezone-media-releases`.
 * `packs/latest.json` lists every pack with each variant's name, SHA-256, byte length and offset, so a reader checks every byte it takes.
 *
 * `GET`/`HEAD /__media/packs/<sha256>.bin` and `/__media/packs/latest.json` need no credential.
 * `PUT` on either takes the publish token.
 * A pack is created only if absent, and the index may only name packs R2 holds.
 * Nothing here decides what production serves: `generate:images` falls back to `/m` and the encoder for anything a pack lacks.
 */
import {
  METHOD_NOT_ALLOWED,
  NOT_FOUND,
  cachedResponse,
  inNamespace,
  jsonError,
  remembered,
  serveImmutable,
} from './media-response';
import type { MediaServing, Refusal } from './media-response';
import { authorizeBearer, readBounded, sha256Hex } from './media-upload';

const MEDIA_PACK_NAMESPACE = '/__media/packs';
const PACK_PATH = /^\/__media\/packs\/([0-9a-f]{64})\.bin$/;
const INDEX_PATH = '/__media/packs/latest.json';
const VARIANT_NAME = /^[0-9a-f]{20}\.[0-9a-f]{10}\.(png|jpg|webp)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const RELEASE = /^[0-9a-f]{40}-\d{1,20}$/;

/** Sixteen packs hold about 230 MB today, so each is near 15 MB; the bound keeps one upload well inside the Worker's memory. */
const MEDIA_PACK_MAX_BYTES = 32 * 1024 * 1024;
/** About 150 bytes per variant. */
const MEDIA_PACK_INDEX_MAX_BYTES = 8 * 1024 * 1024;
/** Readers poll the index once per setup; a minute at the edge is plenty. */
const INDEX_CACHE_CONTROL = 'public, max-age=60';

type MediaPackBucket = Pick<R2Bucket, 'get' | 'head' | 'put'>;

export type MediaPackEnv = {
  MEDIA_RELEASES_BUCKET: MediaPackBucket;
  MEDIA_PUBLISH_TOKEN?: string;
};

type MediaPackEntry = { name: string; sha256: string; bytes: number; offset: number };
type MediaPack = { sha256: string; bytes: number; entries: MediaPackEntry[] };
export type MediaPackIndex = { schemaVersion: 1; release: string; packs: MediaPack[] };

export function mediaPackKey(sha256: string): string {
  return `packs/${sha256}.bin`;
}

export const MEDIA_PACK_INDEX_KEY = 'packs/latest.json';

const isText = (pattern: RegExp) => (value: unknown) => typeof value === 'string' && pattern.test(value);
const isCount = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const isNonEmptyList = (value: unknown) => Array.isArray(value) && value.length > 0;

/** One check per field of a pack entry. */
const ENTRY_FIELDS: Record<keyof MediaPackEntry, (value: unknown) => boolean> = {
  name: isText(VARIANT_NAME),
  sha256: isText(SHA256),
  bytes: (value) => isCount(value) && (value as number) > 0,
  offset: isCount,
};

function isEntry(value: unknown): value is MediaPackEntry {
  const entry = (value ?? {}) as Record<string, unknown>;
  return Object.entries(ENTRY_FIELDS).every(([field, check]) => check(entry[field]));
}

/** The length the entries cover when each starts where the previous one ended, or -1 at the first gap or overlap. */
function tiledLength(entries: readonly MediaPackEntry[]): number {
  return entries.reduce((offset, entry) => (offset === entry.offset ? offset + entry.bytes : -1), 0);
}

/** Each rule a pack must meet, in order, with the reason it is refused when it does not. A pack's entries must tile it exactly. */
const PACK_RULES: [(pack: Record<string, unknown>) => boolean, string][] = [
  [(pack) => isText(SHA256)(pack.sha256) && isCount(pack.bytes), 'A pack is malformed'],
  [
    (pack) => isNonEmptyList(pack.entries) && (pack.entries as unknown[]).every(isEntry),
    'A pack lists a malformed entry',
  ],
  [(pack) => tiledLength(pack.entries as MediaPackEntry[]) === pack.bytes, "A pack's entries do not tile it exactly"],
];

/** Each rule an index must meet, in order, with the reason it is refused when it does not. */
const INDEX_RULES: [(index: Record<string, unknown>) => boolean, string][] = [
  [
    (index) => index.schemaVersion === 1 && isText(RELEASE)(index.release),
    'The index must be schemaVersion 1 and name its release',
  ],
  [(index) => isNonEmptyList(index.packs), 'The index lists no packs'],
];

function firstFailure<T>(value: T, rules: readonly [(value: T) => boolean, string][]): string | null {
  return rules.find(([meets]) => !meets(value))?.[1] ?? null;
}

/** Returns the reason an index is unacceptable, or null when it is well formed. */
export function indexProblem(value: unknown): string | null {
  const index = (typeof value === 'object' ? (value ?? {}) : {}) as Record<string, unknown>;
  const packs = (index.packs ?? []) as Record<string, unknown>[];
  const problem =
    firstFailure(index, INDEX_RULES) ??
    packs.map((pack) => firstFailure((pack ?? {}) as Record<string, unknown>, PACK_RULES)).find(Boolean);
  if (problem) {
    return problem;
  }
  const names = (packs as MediaPack[]).flatMap((pack) => pack.entries.map((entry) => entry.name));
  return new Set(names).size === names.length ? null : 'The index lists a variant twice';
}

type Call = { request: Request; env: MediaPackEnv; serving: MediaServing };

async function servePack(call: Call, sha256: string): Promise<Response> {
  const cached = await cachedResponse(call.request, call.serving);
  if (cached) {
    return cached;
  }
  const object = await call.env.MEDIA_RELEASES_BUCKET.get(mediaPackKey(sha256));
  if (!object) {
    return jsonError(NOT_FOUND);
  }
  const response = await serveImmutable(call.request, object, 'application/octet-stream', {
    sha256,
    bytes: String(object.size),
  });
  return remembered(call.request, response, call.serving);
}

async function serveIndex(call: Call): Promise<Response> {
  const object = await call.env.MEDIA_RELEASES_BUCKET.get(MEDIA_PACK_INDEX_KEY);
  if (!object) {
    return jsonError(NOT_FOUND);
  }
  return await serveImmutable(
    call.request,
    object,
    'application/json',
    { sha256: object.customMetadata?.sha256 ?? '', bytes: String(object.size) },
    INDEX_CACHE_CONTROL
  );
}

async function storePack(call: Call, sha256: string): Promise<Response> {
  const bytes = await readBounded(call.request, MEDIA_PACK_MAX_BYTES);
  if (!bytes) {
    return jsonError({ status: 413, message: 'The pack is too large' });
  }
  if (bytes.byteLength === 0 || (await sha256Hex(bytes)) !== sha256) {
    return jsonError({ status: 422, message: 'The body does not hash to the SHA-256 in the path' });
  }
  const bucket = call.env.MEDIA_RELEASES_BUCKET;
  const written = await bucket.put(mediaPackKey(sha256), bytes, {
    onlyIf: { etagDoesNotMatch: '*' },
    sha256,
    httpMetadata: { contentType: 'application/octet-stream' },
    customMetadata: { sha256, bytes: String(bytes.byteLength) },
  });
  /* Content addressing makes an existing object the same pack. */
  return Response.json(
    { sha256, bytes: bytes.byteLength, created: written !== null },
    { status: written ? 201 : 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

async function readIndex(call: Call): Promise<{ bytes: Uint8Array; index: MediaPackIndex } | Refusal> {
  const bytes = await readBounded(call.request, MEDIA_PACK_INDEX_MAX_BYTES);
  if (!bytes) {
    return { status: 413, message: 'The index is too large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return { status: 400, message: 'The index is not valid JSON' };
  }
  const problem = indexProblem(parsed);
  return problem ? { status: 422, message: problem } : { bytes, index: parsed as MediaPackIndex };
}

/** Replaces the index, but only once every pack it names is stored at the length it claims. */
async function storeIndex(call: Call): Promise<Response> {
  const read = await readIndex(call);
  if ('status' in read) {
    return jsonError(read);
  }
  const bucket = call.env.MEDIA_RELEASES_BUCKET;
  const stored = await Promise.all(read.index.packs.map((pack) => bucket.head(mediaPackKey(pack.sha256))));
  const missing = read.index.packs.filter((pack, index) => stored[index]?.size !== pack.bytes);
  if (missing.length > 0) {
    return jsonError({
      status: 409,
      message: `The index names packs R2 lacks: ${missing.map((p) => p.sha256).join(', ')}`,
    });
  }
  const sha256 = await sha256Hex(read.bytes);
  await bucket.put(MEDIA_PACK_INDEX_KEY, read.bytes, {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { sha256, bytes: String(read.bytes.byteLength) },
  });
  return Response.json(
    { release: read.index.release, packs: read.index.packs.length, sha256 },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

/** Stores a pack, or the index when no pack is named, once the publish token checks out. */
async function publish(call: Call, pack: string | undefined): Promise<Response> {
  const refusal = await authorizeBearer(call.request, call.env.MEDIA_PUBLISH_TOKEN, 'Publishing');
  if (refusal) {
    return jsonError(refusal);
  }
  return pack ? await storePack(call, pack) : await storeIndex(call);
}

/** Answers `/__media/packs`, or returns null for any other path. */
export async function handleMediaPackRequest(
  request: Request,
  env: MediaPackEnv,
  serving: MediaServing = {}
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!inNamespace(url.pathname, MEDIA_PACK_NAMESPACE)) {
    return null;
  }
  const pack = PACK_PATH.exec(url.pathname)?.[1];
  if (!pack && url.pathname !== INDEX_PATH) {
    return jsonError(NOT_FOUND);
  }
  const call = { request, env, serving };
  if (request.method === 'GET' || request.method === 'HEAD') {
    return pack ? await servePack(call, pack) : await serveIndex(call);
  }
  return request.method === 'PUT' ? await publish(call, pack) : jsonError(METHOD_NOT_ALLOWED);
}
