import type { z } from 'zod';

import type { PublicationAssetType } from '../../src/shared/asset-publishing/publicationTargets';

const encoder = new TextEncoder();
/**
 * The largest publisher request body that will be read.
 * `handleAuthenticatedJson` applies it twice, to the declared `Content-Length` and again to the bytes that actually arrive, because the header is optional and a sender is free to understate it.
 */
export const MAX_PUBLISHER_JSON_BODY_BYTES = 16 * 1024;
/**
 * The shape of a published asset's cache token, checked before any signature work is attempted.
 * The same literal is spelled again in `completePublicationJobRequestSchema` in src/shared/asset-publishing/publication.ts, which validates the token on its way in while this validates it on its way back;
 * neither file imports the other and the two must move together.
 */
export const CACHE_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
/**
 * The shape of the deployed signing secret, which is a first gate rather than the whole check.
 * `isValidCacheSigningSecret` also requires the payload to decode to exactly 32 bytes and to re-encode to the same characters, so a secret that merely looks right is still refused.
 */
export const CACHE_SIGNING_SECRET_PATTERN = /^s1\.[A-Za-z0-9_-]{43}$/;

/**
 * The one error whose message is allowed to reach a publisher client, answered as a 400.
 * Anything else thrown from an operation is logged on the server and answered with a flat 500, so throw this only for a reason that is safe to say out loud;
 * `convex/http.ts` uses it for a job id that does not resolve.
 */
export class InvalidPublicationRequestError extends Error {}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacBytes(secret: Uint8Array, message: string): Promise<Uint8Array> {
  const secretCopy = new Uint8Array(secret.byteLength);
  secretCopy.set(secret);
  const key = await crypto.subtle.importKey('raw', secretCopy, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

async function verifyHmacBytes(secret: Uint8Array, message: string, signature: Uint8Array): Promise<boolean> {
  const secretCopy = new Uint8Array(secret.byteLength);
  secretCopy.set(secret);
  const key = await crypto.subtle.importKey('raw', secretCopy, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signatureCopy = new Uint8Array(signature.byteLength);
  signatureCopy.set(signature);
  return await crypto.subtle.verify('HMAC', key, signatureCopy, encoder.encode(message));
}

function cacheSigningSecretBytes(secret: string | undefined): Uint8Array | null {
  if (!secret || !CACHE_SIGNING_SECRET_PATTERN.test(secret)) {
    return null;
  }
  const encoded = secret.slice(3);
  const bytes = fromBase64Url(encoded);
  if (bytes?.byteLength !== 32 || toBase64Url(bytes) !== encoded) {
    return null;
  }
  return bytes;
}

/**
 * Mints a signing secret in the deployable format, for an operator setting `ASSET_PUBLISHER_CACHE_TOKEN_SECRET` and for tests that need a valid one.
 * Nothing in the running system calls it: the secret is configuration, and both the Convex side and the Worker read it from the environment.
 */
export function createCacheSigningSecret(): string {
  return `s1.${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

/**
 * Whether a configured secret is usable, checking that it decodes to canonical 32 bytes rather than only that it matches the pattern.
 * The delivery Worker asks twice, once when it validates its environment and again per request, and answers 503 rather than serving an asset whose token it could not have verified.
 */
export function isValidCacheSigningSecret(secret: string | undefined): boolean {
  return cacheSigningSecretBytes(secret) !== null;
}

/** Base64url over cryptographically random bytes, used for the nonce half of a cache token. */
export function randomPublisherToken(byteLength = 24): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/**
 * Whether the request's `Authorization` header carries the expected bearer secret.
 * Both sides are hashed first and the digests compared over their full fixed width, so the time this takes does not vary with how much of the secret a caller guessed right.
 * A missing `expectedSecret` returns false: a deployment that never configured the secret refuses every caller rather than accepting any.
 */
export async function matchesBearerSecret(request: Request, expectedSecret: string | undefined): Promise<boolean> {
  if (!expectedSecret) {
    return false;
  }
  const actual = request.headers.get('Authorization') ?? '';
  const [expectedHash, actualHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(`Bearer ${expectedSecret}`)),
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
  ]);
  const expected = new Uint8Array(expectedHash);
  const candidate = new Uint8Array(actualHash);
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected[index] ^ candidate[index];
  }
  return difference === 0;
}

/**
 * The whole publisher endpoint contract in one call: authenticate, bound the body, parse it, run the operation, answer JSON that is never cached.
 * An unauthenticated caller gets 404 rather than 401, so probing cannot distinguish an endpoint that exists from one that does not.
 * `execute` receives the parsed body and may throw `InvalidPublicationRequestError` to answer 400 with its message;
 * every other throw becomes a 500 that says nothing.
 */
export async function handleAuthenticatedJson<T>(
  request: Request,
  options: {
    expectedSecret: string | undefined;
    schema: z.ZodType<T>;
    execute: (body: T) => Promise<unknown>;
  }
): Promise<Response> {
  if (!(await matchesBearerSecret(request, options.expectedSecret))) {
    return response({ error: 'Not found' }, 404);
  }

  const contentLength = request.headers.get('Content-Length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) {
      return response({ error: 'Invalid Content-Length' }, 400);
    }
    const declaredBytes = Number(contentLength);
    if (!Number.isSafeInteger(declaredBytes)) {
      return response({ error: 'Invalid Content-Length' }, 400);
    }
    if (declaredBytes > MAX_PUBLISHER_JSON_BODY_BYTES) {
      return response({ error: 'Publisher request body too large' }, 413);
    }
  }

  const chunks: Uint8Array[] = [];
  let actualBytes = 0;
  const reader = request.body?.getReader();
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        actualBytes += value.byteLength;
        if (actualBytes > MAX_PUBLISHER_JSON_BODY_BYTES) {
          await reader.cancel('Publisher request body too large');
          return response({ error: 'Publisher request body too large' }, 413);
        }
        chunks.push(value);
      }
    }
  } catch {
    return response({ error: 'Unable to read publisher request body' }, 400);
  } finally {
    reader?.releaseLock();
  }

  const bytes = new Uint8Array(actualBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return response({ error: 'Body must be valid JSON' }, 400);
  }
  const parsed = options.schema.safeParse(body);
  if (!parsed.success) {
    return response({ error: 'Invalid publisher request' }, 400);
  }
  try {
    return response(await options.execute(parsed.data));
  } catch (error) {
    if (error instanceof InvalidPublicationRequestError) {
      return response({ error: error.message }, 400);
    }
    console.error('Publication HTTP operation failed', error);
    return response({ error: 'Publication operation failed' }, 500);
  }
}

/**
 * Signs a token addressing one published asset, which the Worker sends to Convex on completion and which then rides in the asset's URL.
 * The asset's id and type are inside the signature, not merely alongside it, so a token minted for one asset cannot be moved onto another's path.
 * Throws on an invalid secret rather than returning an unusable token, since a caller reaching this point has already stored bytes that need addressing.
 */
export async function createCacheToken(
  assetId: string,
  assetType: PublicationAssetType,
  secret: string
): Promise<string> {
  const secretBytes = cacheSigningSecretBytes(secret);
  if (!secretBytes) {
    throw new Error('Cache-token signing secret is invalid');
  }
  const nonce = randomPublisherToken(16);
  const unsigned = `v1.${nonce}`;
  const signature = await hmacBytes(secretBytes, `${unsigned}|${assetId}|${assetType}`);
  return `${unsigned}.${toBase64Url(signature)}`;
}

/**
 * Whether a token in a published URL was signed for exactly this asset.
 * Every rejection is a plain false and never a throw, because the caller turns all of them into the same 404 and a distinguishable failure would say which part was wrong.
 * The nonce and signature must re-encode to the characters they arrived as, so a second spelling of the same bytes is not a second valid token.
 */
export async function verifyCacheToken(
  token: string,
  assetId: string,
  assetType: PublicationAssetType,
  secret: string | undefined
): Promise<boolean> {
  const secretBytes = cacheSigningSecretBytes(secret);
  if (!secretBytes || !CACHE_TOKEN_PATTERN.test(token)) {
    return false;
  }
  const [version, nonce, encodedSignature, extra] = token.split('.');
  if (version !== 'v1' || !nonce || !encodedSignature || extra) {
    return false;
  }
  const nonceBytes = fromBase64Url(nonce);
  const signature = fromBase64Url(encodedSignature);
  if (
    nonceBytes?.byteLength !== 16 ||
    toBase64Url(nonceBytes) !== nonce ||
    signature?.byteLength !== 32 ||
    toBase64Url(signature) !== encodedSignature
  ) {
    return false;
  }
  return await verifyHmacBytes(secretBytes, `v1.${nonce}|${assetId}|${assetType}`, signature);
}

/** The publisher's JSON response, `no-store` like every other one here, for the routes that answer outside `handleAuthenticatedJson`. */
export function publicationJson(body: unknown, status = 200): Response {
  return response(body, status);
}
