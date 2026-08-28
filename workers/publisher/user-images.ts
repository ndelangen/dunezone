import {
  matchUserImagePath,
  USER_IMAGE_AVATAR_EDGE_PX,
  USER_IMAGE_FETCH_TIMEOUT_MS,
  USER_IMAGE_INGEST_PATH,
  USER_IMAGE_JPEG_QUALITY,
  USER_IMAGE_MAX_EDGE_PX,
  USER_IMAGE_MAX_REDIRECTS,
  USER_IMAGE_MAX_SOURCE_BYTES,
  USER_IMAGE_MIN_EDGE_PX,
  USER_IMAGE_PUBLIC_PREFIX,
  USER_IMAGE_THUMB_EDGE_PX,
  USER_IMAGE_TOKEN_CHECK_FUNCTION,
  USER_IMAGE_TOKEN_CONSUME_FUNCTION,
  userImageIngestRequestSchema,
  userImagePublicPath,
  userImageTokenCheckAnswerSchema,
} from '../../src/shared/user-images/contract';
import type { UserImageIngestKind } from '../../src/shared/user-images/contract';
import { ImageInspectionError, jpegProfile } from './image-inspection';

/**
 * Ingest and delivery for user-supplied images: ruleset covers and profile avatars.
 *
 * Ingest is the one place the system fetches a URL an author chose: it re-encodes whatever it fetched into a progressive JPEG and stores the result under a content-addressed key.
 * Commanding that work is the guarded privilege, and the Worker holds no secret to do it with: the request carries a single-use token minted by Convex, the Worker asks the Convex ledger whether it is live before spending anything, and after storing it hands the result back through the ledger's consuming mutation, which is the one write path.
 * The response is a completion signal and never carries the result, so a caller cannot learn what was stored without the ledger having recorded it first.
 * Re-encoding is a security boundary as much as a format choice: the stored bytes are our encoder's output, so metadata and polyglot tricks in the source file do not survive into what readers download.
 * Delivery serves the bucket read-only;
 * a key is a sha-256 of the bytes it names, so responses are immutable and cacheable forever.
 */

const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const MAX_INGEST_BODY_BYTES = 16 * 1024;

/** The namespace without its trailing slash, so the bare path is owned by the handler instead of falling through to static assets. */
const USER_IMAGE_NAMESPACE_ROOT = USER_IMAGE_PUBLIC_PREFIX.slice(0, -1);

export type UserImageBucket = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: Uint8Array, options: R2PutOptions): Promise<R2Object | null>;
};

export type UserImageCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

type IngestEnv = {
  USER_IMAGE_BUCKET: UserImageBucket;
  /** The Convex deployment origin whose built-in HTTP API answers the token check and consume calls; configuration, never derived from the request, so a caller cannot point the Worker at a ledger that always says yes. */
  CONVEX_CLOUD_BASE_URL: string;
  /**
   * The origin stored URLs are minted on, https://dune.zone in deployment.
   * The Worker answers on its workers.dev hostname too, so without the pin the bucket's URLs could split across two origins and defeat a one-origin CSP.
   * Local dev leaves it unset and falls back to the ingest request's own origin.
   */
  USER_IMAGE_PUBLIC_BASE_URL?: string;
  IMAGES: ImagesBinding;
};

type FetchedSource = { ok: true; bytes: Uint8Array } | { ok: false; message: string };

/** A refusal the author can act on, as opposed to a bug, which is left to throw. */
class IngestRefusal extends Error {}

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Follows redirects by hand so every hop stays https.
 * `redirect: 'follow'` would happily cross to http mid-chain, and the whole point of the fetch is that its origin is untrusted.
 */
async function fetchSourceImage(sourceUrl: string): Promise<FetchedSource> {
  let current = sourceUrl;
  for (let hop = 0; hop <= USER_IMAGE_MAX_REDIRECTS; hop += 1) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, message: 'The image URL could not be parsed' };
    }
    if (parsed.protocol !== 'https:') {
      return { ok: false, message: 'The image must be served over https://' };
    }
    let response: Response;
    try {
      response = await fetch(parsed.toString(), {
        redirect: 'manual',
        headers: { Accept: 'image/*' },
        signal: AbortSignal.timeout(USER_IMAGE_FETCH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: 'The image host did not answer in time' };
    }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel();
      const location = response.headers.get('Location');
      if (!location) {
        return { ok: false, message: 'The image host redirected without a destination' };
      }
      current = new URL(location, parsed).toString();
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, message: `The image host answered with status ${response.status}` };
    }
    const contentType = response.headers.get('Content-Type') ?? '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      await response.body?.cancel();
      return { ok: false, message: 'The URL did not return an image' };
    }
    const declaredLength = Number(response.headers.get('Content-Length') ?? '0');
    if (Number.isFinite(declaredLength) && declaredLength > USER_IMAGE_MAX_SOURCE_BYTES) {
      await response.body?.cancel();
      return { ok: false, message: 'The image is larger than the 10 MB limit' };
    }
    const bytes = await readWithLimit(response.body, USER_IMAGE_MAX_SOURCE_BYTES);
    if (bytes === null) {
      return { ok: false, message: 'The image is larger than the 10 MB limit' };
    }
    if (bytes.byteLength === 0) {
      return { ok: false, message: 'The image host returned an empty response' };
    }
    return { ok: true, bytes };
  }
  return { ok: false, message: 'The image URL redirects too many times' };
}

/** Reads a body up to the limit and returns null once it is exceeded, so an unbounded stream costs at most one extra chunk. */
async function readWithLimit(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array | null> {
  if (!body) {
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
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
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

type EncodedRendition = { bytes: Uint8Array; widthPx: number; heightPx: number };

/** Decodes the source, fits it into the given box and encodes one JPEG rendition. `scale-down` letterboxes covers; `cover` center-crops avatars. */
async function encodeRendition(
  images: ImagesBinding,
  source: Uint8Array,
  box: { edgePx: number; fit: 'scale-down' | 'cover' }
): Promise<EncodedRendition> {
  const input = new Response(source).body;
  if (!input) {
    throw new Error('Source image produced no readable stream');
  }
  let encoded: Uint8Array;
  try {
    const result = await images
      .input(input)
      .transform({ width: box.edgePx, height: box.edgePx, fit: box.fit })
      .output({ format: 'image/jpeg', quality: USER_IMAGE_JPEG_QUALITY });
    encoded = new Uint8Array(await new Response(result.image()).arrayBuffer());
  } catch {
    throw new IngestRefusal('The file at that URL could not be read as an image');
  }
  let profile;
  try {
    profile = jpegProfile(encoded);
  } catch (error) {
    if (error instanceof ImageInspectionError) {
      throw new IngestRefusal('The image could not be encoded');
    }
    throw error;
  }
  return { bytes: encoded, widthPx: profile.widthPx, heightPx: profile.heightPx };
}

/**
 * Encodes the two renditions every stored image carries: a full one for detail frames and a thumb for grids and chips.
 * The full rendition asserts the progressive output the delivery path promises, the same stance `assertPublishedJpeg` takes for published cards.
 * The thumb does not: scaling a wide or tall image into the thumb box can legally leave one edge under the encoder's 50px progressive floor, and a baseline thumb costs nothing at that size.
 */
async function encodeCoverRenditions(
  images: ImagesBinding,
  source: Uint8Array
): Promise<{ full: EncodedRendition; thumb: EncodedRendition }> {
  const full = await encodeRendition(images, source, { edgePx: USER_IMAGE_MAX_EDGE_PX, fit: 'scale-down' });
  if (full.widthPx < USER_IMAGE_MIN_EDGE_PX || full.heightPx < USER_IMAGE_MIN_EDGE_PX) {
    throw new IngestRefusal(`The image must be at least ${USER_IMAGE_MIN_EDGE_PX}px on each side`);
  }
  const fullProfile = jpegProfile(full.bytes);
  if (!fullProfile.progressive) {
    throw new Error(`Encoded cover JPEG is not progressive: start-of-frame ${fullProfile.startOfFrame}`);
  }
  const thumb = await encodeRendition(images, source, { edgePx: USER_IMAGE_THUMB_EDGE_PX, fit: 'scale-down' });
  return { full, thumb };
}

/**
 * Encodes the one square avatar rendition, center-cropped into the avatar box by the encoder's `cover` fit.
 * The minimum-edge refusal mirrors covers, and a non-square result means the encoder could not fill the box, so it is refused rather than stored;
 * the consume floor would bounce it anyway, and this refusal reaches the operator with a readable message instead.
 * The progressive assertion holds because the avatar box sits far above the encoder's 50px baseline fallback.
 */
async function encodeAvatarRendition(images: ImagesBinding, source: Uint8Array): Promise<EncodedRendition> {
  const avatar = await encodeRendition(images, source, { edgePx: USER_IMAGE_AVATAR_EDGE_PX, fit: 'cover' });
  if (avatar.widthPx < USER_IMAGE_MIN_EDGE_PX || avatar.heightPx < USER_IMAGE_MIN_EDGE_PX) {
    throw new IngestRefusal(`The image must be at least ${USER_IMAGE_MIN_EDGE_PX}px on each side`);
  }
  if (avatar.widthPx !== avatar.heightPx) {
    throw new IngestRefusal('The image could not be cropped to a square avatar');
  }
  const avatarProfile = jpegProfile(avatar.bytes);
  if (!avatarProfile.progressive) {
    throw new Error(`Encoded avatar JPEG is not progressive: start-of-frame ${avatarProfile.startOfFrame}`);
  }
  return avatar;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** How long the Worker waits for the Convex ledger before failing the ingest; the ledger is an indexed point read, so a slow answer means trouble, not load. */
const CONVEX_LEDGER_TIMEOUT_MS = 10_000;

/**
 * Calls one public Convex function over the deployment's built-in HTTP API and unwraps the response envelope.
 * No credential rides along: the functions are public by design and the token inside `args` is the only thing being presented.
 */
async function callConvex(
  baseUrl: string,
  kind: 'query' | 'mutation',
  path: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/${kind}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, args, format: 'json' }),
    signal: AbortSignal.timeout(CONVEX_LEDGER_TIMEOUT_MS),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof payload !== 'object' || payload === null) {
    throw new Error(`Convex ${path} answered with status ${response.status}`);
  }
  const envelope = payload as { status?: unknown; value?: unknown; errorMessage?: unknown };
  if (envelope.status !== 'success') {
    throw new Error(`Convex ${path} failed: ${String(envelope.errorMessage ?? 'unknown error')}`);
  }
  return envelope.value;
}

type TokenIntrospection = { live: false } | { live: true; kind: UserImageIngestKind };

/**
 * Asks the ledger whether the presented token is live;
 * only a definite yes unlocks the expensive work.
 * A live answer also names the rendition recipe the token was minted for, so the recipe comes from the ledger rather than the request body.
 * A live answer without a kind defaults to the cover recipe, which keeps the deploy window safe: a ledger predating kinds only ever minted cover tokens.
 */
async function introspectIngestToken(baseUrl: string, token: string): Promise<TokenIntrospection> {
  const value = await callConvex(baseUrl, 'query', USER_IMAGE_TOKEN_CHECK_FUNCTION, { token, now: Date.now() });
  const answer = userImageTokenCheckAnswerSchema.safeParse(value);
  if (!answer.success || !answer.data.valid) {
    return { live: false };
  }
  return { live: true, kind: answer.data.kind ?? 'ruleset_cover' };
}

type ConsumeAnswer = { ok: true } | { ok: false; reason: string };

/** Hands the stored result and its R2 keys to the consuming mutation, the single write path of the token flow. */
async function consumeIngestToken(
  baseUrl: string,
  token: string,
  result: { url: string; thumb_url?: string; width: number; height: number },
  r2Keys: string[]
): Promise<ConsumeAnswer> {
  const value = await callConvex(baseUrl, 'mutation', USER_IMAGE_TOKEN_CONSUME_FUNCTION, {
    token,
    result,
    r2_keys: r2Keys,
  });
  if (typeof value !== 'object' || value === null || typeof (value as { ok?: unknown }).ok !== 'boolean') {
    throw new Error('Convex consume answered with an unexpected shape');
  }
  const answer = value as { ok: boolean; reason?: unknown };
  return answer.ok ? { ok: true } : { ok: false, reason: String(answer.reason ?? 'unknown') };
}

/** Turns a ledger refusal into the author-facing message the waiting save reports. */
function consumeRefusalMessage(reason: string): string {
  switch (reason) {
    case 'consumed':
      return 'This save was already recorded';
    case 'expired':
      return 'The save took too long and its ticket expired';
    case 'entity_gone':
      return 'The page this image was saved for no longer exists';
    case 'superseded':
      return 'A newer save replaced this image before it was stored';
    default:
      return 'The stored image could not be recorded';
  }
}

/**
 * Handles the ingest POST, or returns null for every other path.
 * Every request must carry a minted ledger token in its body;
 * the Worker reads the body to see that credential, so a stranger costs one bounded body read plus one indexed ledger lookup.
 * Refusals come back as 4xx with an author-facing message;
 * anything else is a 500 the caller reports as a plain failure.
 */
export async function handleUserImageIngest(request: Request, env: IngestEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== USER_IMAGE_INGEST_PATH) {
    return null;
  }
  if (request.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }
  const rawBody = await readWithLimit(request.body, MAX_INGEST_BODY_BYTES);
  if (rawBody === null) {
    return jsonError(413, 'Request body is too large');
  }
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonError(400, 'Request body is not JSON');
  }
  const parsedRequest = userImageIngestRequestSchema.safeParse(parsedBody);
  if (!parsedRequest.success) {
    return jsonError(400, parsedRequest.error.issues[0]?.message ?? 'Invalid ingest request');
  }
  const ingestToken = parsedRequest.data.token;
  /* The recipe comes from the ledger's introspection answer rather than the request body, so a caller cannot choose what the Worker encodes. */
  let introspection: TokenIntrospection;
  try {
    introspection = await introspectIngestToken(env.CONVEX_CLOUD_BASE_URL, ingestToken);
  } catch {
    return jsonError(503, 'The ingest ledger did not answer');
  }
  if (!introspection.live) {
    return jsonError(403, 'Not authorized');
  }
  const recipe: UserImageIngestKind = introspection.kind;

  const fetched = await fetchSourceImage(parsedRequest.data.source_url);
  if (!fetched.ok) {
    return jsonError(422, fetched.message);
  }

  const storeRendition = async (rendition: EncodedRendition): Promise<string> => {
    const key = `${await sha256Hex(rendition.bytes)}.jpg`;
    const written = await env.USER_IMAGE_BUCKET.put(key, rendition.bytes, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: IMMUTABLE_CACHE_CONTROL },
      customMetadata: { sourceUrl: parsedRequest.data.source_url },
    });
    if (!written) {
      throw new Error('User image was not written');
    }
    return key;
  };
  const publicOrigin = (env.USER_IMAGE_PUBLIC_BASE_URL ?? url.origin).replace(/\/$/, '');

  if (recipe === 'profile_avatar') {
    let avatar: EncodedRendition;
    try {
      avatar = await encodeAvatarRendition(env.IMAGES, fetched.bytes);
    } catch (error) {
      if (error instanceof IngestRefusal) {
        return jsonError(422, error.message);
      }
      throw error;
    }
    const avatarKey = await storeRendition(avatar);
    let answer: ConsumeAnswer;
    try {
      answer = await consumeIngestToken(
        env.CONVEX_CLOUD_BASE_URL,
        ingestToken,
        {
          url: `${publicOrigin}${userImagePublicPath(avatarKey)}`,
          width: avatar.widthPx,
          height: avatar.heightPx,
        },
        [avatarKey]
      );
    } catch {
      return jsonError(502, 'The stored image could not be recorded');
    }
    if (!answer.ok) {
      return jsonError(409, consumeRefusalMessage(answer.reason));
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let renditions: Awaited<ReturnType<typeof encodeCoverRenditions>>;
  try {
    renditions = await encodeCoverRenditions(env.IMAGES, fetched.bytes);
  } catch (error) {
    if (error instanceof IngestRefusal) {
      return jsonError(422, error.message);
    }
    throw error;
  }
  const key = await storeRendition(renditions.full);
  const thumbKey = await storeRendition(renditions.thumb);

  /* The ledger records the result and the R2 keys and burns the token in one transaction; this response is only the completion signal. */
  let answer: ConsumeAnswer;
  try {
    answer = await consumeIngestToken(
      env.CONVEX_CLOUD_BASE_URL,
      ingestToken,
      {
        url: `${publicOrigin}${userImagePublicPath(key)}`,
        thumb_url: `${publicOrigin}${userImagePublicPath(thumbKey)}`,
        width: renditions.full.widthPx,
        height: renditions.full.heightPx,
      },
      [key, thumbKey]
    );
  } catch {
    return jsonError(502, 'The stored image could not be recorded');
  }
  if (!answer.ok) {
    return jsonError(409, consumeRefusalMessage(answer.reason));
  }
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

function userImageHeaders(object: R2Object): Headers {
  const headers = new Headers();
  headers.set('Content-Type', 'image/jpeg');
  headers.set('Content-Length', String(object.size));
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', IMMUTABLE_CACHE_CONTROL);
  headers.set('X-Content-Type-Options', 'nosniff');
  return headers;
}

/**
 * Serves a stored user image, or returns null for paths outside the namespace.
 * Keys are content hashes, so a hit is immutable: the only conditional handling worth having is the exact If-None-Match echo, and the edge cache keeps repeat reads off the bucket.
 */
export async function handleUserImageRequest(
  request: Request,
  env: Pick<IngestEnv, 'USER_IMAGE_BUCKET'>,
  ctx: Pick<ExecutionContext, 'waitUntil'>,
  dependencies: { cache?: UserImageCache } = {}
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== USER_IMAGE_NAMESPACE_ROOT && !url.pathname.startsWith(USER_IMAGE_PUBLIC_PREFIX)) {
    return null;
  }
  const key = matchUserImagePath(url.pathname);
  if (!key) {
    return jsonError(404, 'Not found');
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return jsonError(405, 'Method not allowed');
  }

  const cache = dependencies.cache ?? caches.default;
  const cacheKey = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
  try {
    const hit = await cache.match(cacheKey);
    if (hit) {
      if (request.headers.get('If-None-Match') === hit.headers.get('ETag')) {
        await hit.body?.cancel();
        return new Response(null, { status: 304, headers: { ETag: hit.headers.get('ETag') ?? '' } });
      }
      if (request.method === 'HEAD') {
        const headers = new Headers(hit.headers);
        await hit.body?.cancel();
        return new Response(null, { status: 200, headers });
      }
      return hit;
    }
  } catch {
    console.error(JSON.stringify({ event: 'user_image_cache_match', result: 'failed' }));
  }

  const object = await env.USER_IMAGE_BUCKET.get(key);
  if (!object) {
    return jsonError(404, 'Not found');
  }
  const headers = userImageHeaders(object);
  if (request.headers.get('If-None-Match') === object.httpEtag) {
    await object.body?.cancel();
    return new Response(null, { status: 304, headers: { ETag: object.httpEtag } });
  }
  if (request.method === 'HEAD') {
    await object.body?.cancel();
    return new Response(null, { status: 200, headers });
  }
  const response = new Response(object.body, { status: 200, headers });
  ctx.waitUntil(
    (async () => {
      try {
        await cache.put(cacheKey, response.clone());
      } catch {
        console.error(JSON.stringify({ event: 'user_image_cache_put', result: 'failed' }));
      }
    })()
  );
  return response;
}
