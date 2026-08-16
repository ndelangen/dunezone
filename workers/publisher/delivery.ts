import { isValidCacheSigningSecret, verifyCacheToken } from '../../convex/lib/publicationHttp';
import { factionSheetKey } from './r2';

// HTTP precondition/range evaluation (private): decisions are applied, not re-exported.
type AssetRepresentation = {
  exists: boolean;
  etag?: string;
  lastModified?: string;
  size?: number;
};

type AssetRequestDecision =
  | { status: 200 }
  | { status: 206; range: { offset: number; length: number } }
  | { status: 304 }
  | { status: 404 }
  | { status: 412 }
  | { status: 416; size?: number };

type EntityTag = { weak: boolean; opaque: string };

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const LONG_WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function entityTagCharacter(character: string): boolean {
  const code = character.charCodeAt(0);
  return code === 0x21 || (code >= 0x23 && code <= 0x7e) || code >= 0x80;
}

function parseEntityTagList(value: string): { star: boolean; tags: EntityTag[] } | null {
  if (value.trim() === '*') {
    return { star: true, tags: [] };
  }
  const tags: EntityTag[] = [];
  let index = 0;
  while (index < value.length) {
    while (value[index] === ' ' || value[index] === '\t') {
      index += 1;
    }
    let weak = false;
    if (value.startsWith('W/', index)) {
      weak = true;
      index += 2;
    }
    if (value[index] !== '"') {
      return null;
    }
    index += 1;
    let opaque = '';
    while (index < value.length && value[index] !== '"') {
      const character = value[index];
      if (!character || !entityTagCharacter(character)) {
        return null;
      }
      opaque += character;
      index += 1;
    }
    if (value[index] !== '"') {
      return null;
    }
    index += 1;
    tags.push({ weak, opaque });
    while (value[index] === ' ' || value[index] === '\t') {
      index += 1;
    }
    if (index === value.length) {
      break;
    }
    if (value[index] !== ',') {
      return null;
    }
    index += 1;
    if (index === value.length) {
      return null;
    }
  }
  return tags.length > 0 ? { star: false, tags } : null;
}

function currentEntityTag(value: string | undefined): EntityTag | null {
  if (value === undefined) {
    return null;
  }
  const parsed = parseEntityTagList(value);
  return parsed && !parsed.star && parsed.tags.length === 1 ? (parsed.tags[0] ?? null) : null;
}

function validUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  weekday: number
): number | null {
  if (
    year < 1601 ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 60
  ) {
    return null;
  }
  const normalSecond = Math.min(second, 59);
  const timestamp = Date.UTC(year, month, day, hour, minute, normalSecond);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== normalSecond ||
    date.getUTCDay() !== weekday
  ) {
    return null;
  }
  return timestamp + (second === 60 ? 1000 : 0);
}

function monthIndex(value: string): number {
  return MONTHS.indexOf(value);
}

function parseHttpDate(value: string, now = Date.now()): number | null {
  const imf =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value
    );
  if (imf) {
    return validUtc(
      Number(imf[4]),
      monthIndex(imf[3] ?? ''),
      Number(imf[2]),
      Number(imf[5]),
      Number(imf[6]),
      Number(imf[7]),
      SHORT_WEEKDAYS.indexOf(imf[1] as (typeof SHORT_WEEKDAYS)[number])
    );
  }

  const rfc850 =
    /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}):(\d{2}):(\d{2}) GMT$/.exec(
      value
    );
  if (rfc850) {
    const currentYear = new Date(now).getUTCFullYear();
    let year = Math.floor(currentYear / 100) * 100 + Number(rfc850[4]);
    if (year > currentYear + 50) {
      year -= 100;
    }
    return validUtc(
      year,
      monthIndex(rfc850[3] ?? ''),
      Number(rfc850[2]),
      Number(rfc850[5]),
      Number(rfc850[6]),
      Number(rfc850[7]),
      LONG_WEEKDAYS.indexOf(rfc850[1] as (typeof LONG_WEEKDAYS)[number])
    );
  }

  const asctime =
    /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (?: (\d)|(\d{2})) (\d{2}):(\d{2}):(\d{2}) (\d{4})$/.exec(
      value
    );
  if (!asctime) {
    return null;
  }
  return validUtc(
    Number(asctime[8]),
    monthIndex(asctime[2] ?? ''),
    Number(asctime[3] ?? asctime[4]),
    Number(asctime[5]),
    Number(asctime[6]),
    Number(asctime[7]),
    SHORT_WEEKDAYS.indexOf(asctime[1] as (typeof SHORT_WEEKDAYS)[number])
  );
}

function ifMatchPasses(value: string, representation: AssetRepresentation): boolean {
  const parsed = parseEntityTagList(value);
  if (!parsed) {
    return false;
  }
  if (parsed.star) {
    return representation.exists;
  }
  const current = currentEntityTag(representation.etag);
  return (
    representation.exists &&
    current !== null &&
    !current.weak &&
    parsed.tags.some((candidate) => !candidate.weak && candidate.opaque === current.opaque)
  );
}

function ifNoneMatchPasses(value: string, representation: AssetRepresentation): boolean {
  const parsed = parseEntityTagList(value);
  if (!parsed) {
    return true;
  }
  if (parsed.star) {
    return !representation.exists;
  }
  const current = currentEntityTag(representation.etag);
  return (
    !representation.exists || current === null || !parsed.tags.some((candidate) => candidate.opaque === current.opaque)
  );
}

function ifRangePasses(value: string, representation: AssetRepresentation, now: number): boolean {
  if (value.startsWith('"') || value.startsWith('W/')) {
    const parsed = parseEntityTagList(value);
    const candidate = parsed && !parsed.star && parsed.tags.length === 1 ? parsed.tags[0] : null;
    const current = currentEntityTag(representation.etag);
    return Boolean(candidate && current && !candidate.weak && !current.weak && candidate.opaque === current.opaque);
  }
  const validator = parseHttpDate(value, now);
  const lastModified = representation.lastModified ? parseHttpDate(representation.lastModified, now) : null;
  return validator !== null && lastModified !== null && validator === lastModified;
}

function resolvedRange(value: string, size: number): { offset: number; length: number } | null {
  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(value);
  if (!match) {
    return null;
  }
  const suffix = match[3];
  if (suffix !== undefined) {
    const requestedLength = Number(suffix);
    if (!Number.isSafeInteger(requestedLength) || requestedLength <= 0 || size <= 0) {
      return null;
    }
    const length = Math.min(requestedLength, size);
    return { offset: size - length, length };
  }
  const offset = Number(match[1]);
  const requestedEnd = match[2] === '' ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(requestedEnd) ||
    offset < 0 ||
    offset >= size ||
    requestedEnd < offset
  ) {
    return null;
  }
  const end = Math.min(requestedEnd, size - 1);
  return { offset, length: end - offset + 1 };
}

function evaluateAssetRequest(
  request: Pick<Request, 'headers' | 'method'>,
  representation: AssetRepresentation,
  now = Date.now()
): AssetRequestDecision {
  const ifMatch = request.headers.get('If-Match');
  if (ifMatch !== null && !ifMatchPasses(ifMatch, representation)) {
    return { status: 412 };
  }

  if (ifMatch === null && representation.exists) {
    const ifUnmodifiedSince = request.headers.get('If-Unmodified-Since');
    const condition = ifUnmodifiedSince ? parseHttpDate(ifUnmodifiedSince, now) : null;
    const lastModified = representation.lastModified ? parseHttpDate(representation.lastModified, now) : null;
    if (condition !== null && lastModified !== null && lastModified > condition) {
      return { status: 412 };
    }
  }

  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch !== null && !ifNoneMatchPasses(ifNoneMatch, representation)) {
    return { status: 304 };
  }

  if (ifNoneMatch === null && representation.exists) {
    const ifModifiedSince = request.headers.get('If-Modified-Since');
    const condition = ifModifiedSince ? parseHttpDate(ifModifiedSince, now) : null;
    const lastModified = representation.lastModified ? parseHttpDate(representation.lastModified, now) : null;
    if (condition !== null && lastModified !== null && lastModified <= condition) {
      return { status: 304 };
    }
  }

  if (!representation.exists) {
    return { status: 404 };
  }
  if (request.method === 'HEAD') {
    return { status: 200 };
  }

  const rangeValue = request.headers.get('Range');
  if (rangeValue === null) {
    return { status: 200 };
  }
  const ifRange = request.headers.get('If-Range');
  if (ifRange !== null && !ifRangePasses(ifRange, representation, now)) {
    return { status: 200 };
  }

  const size =
    Number.isSafeInteger(representation.size) && (representation.size ?? -1) >= 0 ? representation.size : undefined;
  const range = size === undefined ? null : resolvedRange(rangeValue, size);
  if (!range) {
    return { status: 416, size };
  }
  return { status: 206, range };
}

const ASSET_TYPE = 'faction_sheet' as const;
const TOKEN_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const NO_STORE = 'no-store';
const FACTION_ID_PATTERN = /^[0-9a-z]{16,64}$/;
const PUBLIC_ROUTE_PATTERN = /^\/published\/factions\/([0-9a-z]{16,64})\/sheet\.pdf$/;

export type PublicAssetCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

export type PublicAssetBucket = {
  get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | R2Object | null>;
  head(key: string): Promise<R2Object | null>;
};

type DeliveryDependencies = {
  cache?: PublicAssetCache;
};

function noStoreResponse(body: BodyInit | null, status: number, headers?: HeadersInit): Response {
  const resultHeaders = new Headers(headers);
  resultHeaders.set('Cache-Control', NO_STORE);
  return new Response(body, { status, headers: resultHeaders });
}

function errorResponse(status: number, message: string, headers?: HeadersInit): Response {
  return noStoreResponse(message, status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...Object.fromEntries(new Headers(headers)),
  });
}

function exactToken(url: URL): string | null | undefined {
  const tokens = url.searchParams.getAll('v');
  if (tokens.length === 0) {
    return undefined;
  }
  if (tokens.length !== 1 || tokens[0].length === 0) {
    return null;
  }
  return tokens[0];
}

function cacheRequest(request: Request, stablePath: string, token: string): Request {
  const url = new URL(request.url);
  url.pathname = stablePath;
  url.search = `?v=${encodeURIComponent(token)}`;
  url.hash = '';
  return new Request(url.toString(), { method: 'GET' });
}

function rangeCacheRequest(base: Request, range: string): Request {
  return new Request(base.url, { method: 'GET', headers: { Range: range } });
}

function assetHeaders(object: R2Object, tokenized: boolean): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Disposition', 'inline; filename="faction-sheet.pdf"');
  headers.set('Content-Length', String(object.size));
  headers.set('Content-Type', 'application/pdf');
  headers.set('ETag', object.httpEtag);
  headers.set('Last-Modified', object.uploaded.toUTCString());
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', tokenized ? TOKEN_CACHE_CONTROL : NO_STORE);
  return headers;
}

function responseRepresentation(response: Response): AssetRepresentation {
  const contentLength = response.headers.get('Content-Length');
  const size = contentLength !== null && /^\d+$/.test(contentLength) ? Number(contentLength) : NaN;
  return {
    exists: true,
    etag: response.headers.get('ETag') ?? undefined,
    lastModified: response.headers.get('Last-Modified') ?? undefined,
    size: Number.isSafeInteger(size) ? size : undefined,
  };
}

function objectRepresentation(object: R2Object | null): AssetRepresentation {
  return object
    ? {
        exists: true,
        etag: object.httpEtag,
        lastModified: object.uploaded.toUTCString(),
        size: object.size,
      }
    : { exists: false };
}

function conditionalHeaders(headers: Headers, status: 304 | 412): Headers {
  const result = new Headers(headers);
  result.delete('Content-Length');
  result.delete('Content-Range');
  if (status === 412) {
    result.set('Cache-Control', NO_STORE);
  }
  return result;
}

function rangeErrorHeaders(headers: Headers, size: number | undefined): Headers {
  const result = new Headers(headers);
  result.delete('Content-Length');
  result.set('Cache-Control', NO_STORE);
  if (size === undefined) {
    result.delete('Content-Range');
  } else {
    result.set('Content-Range', `bytes */${size}`);
  }
  return result;
}

async function safeCachePut(cache: PublicAssetCache, key: Request, value: Response): Promise<void> {
  try {
    await cache.put(key, value);
  } catch {
    console.error(JSON.stringify({ event: 'asset_delivery_cache_put', result: 'failed' }));
  }
}

async function cancelReadableBody(body: ReadableStream | null | undefined): Promise<void> {
  if (!body) {
    return;
  }
  try {
    await body.cancel();
  } catch {
    // The response metadata remains usable when a local stream is already closed.
  }
}

async function cancelResponseBody(response: Response | undefined): Promise<void> {
  await cancelReadableBody(response?.body);
}

function metadataResponse(
  decision: Extract<AssetRequestDecision, { status: 200 | 304 | 412 | 416 }>,
  headers: Headers
): Response {
  if (decision.status === 304 || decision.status === 412) {
    return new Response(null, {
      status: decision.status,
      headers: conditionalHeaders(headers, decision.status),
    });
  }
  if (decision.status === 416) {
    return new Response(null, { status: 416, headers: rangeErrorHeaders(headers, decision.size) });
  }
  return new Response(null, { status: 200, headers });
}

async function cachedAssetResponse(
  request: Request,
  hit: Response,
  cache: PublicAssetCache,
  cacheKey: Request
): Promise<Response> {
  const representation = responseRepresentation(hit);
  const decision = evaluateAssetRequest(request, representation);
  if (decision.status === 200) {
    if (request.method === 'GET') {
      return hit;
    }
    const headers = new Headers(hit.headers);
    await cancelResponseBody(hit);
    return metadataResponse(decision, headers);
  }
  if (decision.status === 304 || decision.status === 412 || decision.status === 416) {
    const headers = new Headers(hit.headers);
    await cancelResponseBody(hit);
    return metadataResponse(decision, headers);
  }
  if (decision.status !== 206) {
    await cancelResponseBody(hit);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }

  const rangeValue = request.headers.get('Range');
  await cancelResponseBody(hit);
  if (!rangeValue) {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  let partial: Response | undefined;
  try {
    partial = await cache.match(rangeCacheRequest(cacheKey, rangeValue));
  } catch {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  if (partial?.status !== 206) {
    await cancelResponseBody(partial);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  const currentSize = responseRepresentation(hit).size;
  if (representation.size === undefined || currentSize === undefined || currentSize !== representation.size) {
    await cancelResponseBody(partial);
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  const headers = new Headers(partial.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', NO_STORE);
  headers.set('Content-Length', String(decision.range.length));
  headers.set(
    'Content-Range',
    `bytes ${decision.range.offset}-${decision.range.offset + decision.range.length - 1}/${currentSize}`
  );
  return new Response(partial.body, { status: 206, headers });
}

async function r2BodyResponse(
  request: Request,
  object: R2ObjectBody,
  decision: Extract<AssetRequestDecision, { status: 200 | 206 }>,
  tokenized: boolean,
  cache: PublicAssetCache,
  cacheKey: Request | null,
  ctx: Pick<ExecutionContext, 'waitUntil'>
): Promise<Response> {
  const headers = assetHeaders(object, tokenized);
  if (decision.status === 206) {
    headers.set('Cache-Control', NO_STORE);
    headers.set('Content-Length', String(decision.range.length));
    headers.set(
      'Content-Range',
      `bytes ${decision.range.offset}-${decision.range.offset + decision.range.length - 1}/${object.size}`
    );
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('Content-Length', String(object.size));
  const result = new Response(object.body, { status: 200, headers });
  if (cacheKey && request.method === 'GET') {
    ctx.waitUntil(safeCachePut(cache, cacheKey, result.clone()));
  }
  return result;
}

export function factionSheetPublicPath(factionId: string): string {
  if (!FACTION_ID_PATTERN.test(factionId)) {
    throw new Error('Invalid Convex faction id');
  }
  return `/published/factions/${encodeURIComponent(factionId)}/sheet.pdf`;
}

export async function handlePublicAssetRequest(
  request: Request,
  env: Pick<Env, 'ASSET_BUCKET' | 'ASSET_PUBLISHER_CACHE_TOKEN_SECRET'>,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  dependencies: DeliveryDependencies = {}
): Promise<Response | null> {
  const url = new URL(request.url);
  const ownsNamespace = url.pathname === '/published' || url.pathname.startsWith('/published/');
  if (!ownsNamespace) {
    return null;
  }

  const route = PUBLIC_ROUTE_PATTERN.exec(url.pathname);
  if (!route) {
    return errorResponse(404, 'Not Found');
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return errorResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }
  if (!isValidCacheSigningSecret(env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET)) {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }

  const factionId = route[1];
  if (!factionId) {
    return errorResponse(404, 'Not Found');
  }
  const stablePath = factionSheetPublicPath(factionId);
  const token = exactToken(url);
  if (token === null || token === undefined) {
    return errorResponse(404, 'Not Found');
  }
  if (!(await verifyCacheToken(token, factionId, ASSET_TYPE, env.ASSET_PUBLISHER_CACHE_TOKEN_SECRET))) {
    return errorResponse(404, 'Not Found');
  }
  const verifiedToken = token;

  const bucket = env.ASSET_BUCKET as PublicAssetBucket;
  const key = factionSheetKey(factionId);
  let metadata: R2Object | null;
  try {
    metadata = await bucket.head(key);
  } catch {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  if (!metadata) {
    return errorResponse(404, 'Not Found');
  }

  const decision = evaluateAssetRequest(request, objectRepresentation(metadata));
  const headers = assetHeaders(metadata, true);
  if (decision.status === 304 || decision.status === 412 || decision.status === 416) {
    return metadataResponse(decision, headers);
  }
  if (request.method === 'HEAD') {
    return decision.status === 200
      ? metadataResponse(decision, headers)
      : errorResponse(503, 'Asset Temporarily Unavailable');
  }
  if (decision.status !== 200 && decision.status !== 206) {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }

  const cache = dependencies.cache ?? caches.default;
  const canonicalCacheRequest = cacheRequest(request, stablePath, verifiedToken);
  try {
    const hit = await cache.match(canonicalCacheRequest);
    if (hit) {
      if (responseRepresentation(hit).etag === metadata.httpEtag) {
        return await cachedAssetResponse(request, hit, cache, canonicalCacheRequest);
      }
      await cancelResponseBody(hit);
    }
  } catch {
    console.error(JSON.stringify({ event: 'asset_delivery_cache_match', result: 'failed' }));
  }

  let object: R2ObjectBody | R2Object | null;
  try {
    object = await bucket.get(key, {
      onlyIf: { etagMatches: metadata.etag },
      ...(decision.status === 206 ? { range: decision.range } : {}),
    });
  } catch {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  if (!object || !('body' in object) || object.etag !== metadata.etag) {
    return errorResponse(503, 'Asset Temporarily Unavailable');
  }
  return await r2BodyResponse(request, object, decision, true, cache, canonicalCacheRequest, ctx);
}
