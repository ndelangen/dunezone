import type { z } from 'zod';

const encoder = new TextEncoder();
export const MAX_PUBLISHER_JSON_BODY_BYTES = 16 * 1_024;
export const CACHE_TOKEN_PATTERN = /^v1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
export const CACHE_SIGNING_SECRET_PATTERN = /^s1\.[A-Za-z0-9_-]{43}$/;

export class InvalidPublisherRequestError extends Error {}

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
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
  const key = await crypto.subtle.importKey(
    'raw',
    secretCopy,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

async function verifyHmacBytes(
  secret: Uint8Array,
  message: string,
  signature: Uint8Array
): Promise<boolean> {
  const secretCopy = new Uint8Array(secret.byteLength);
  secretCopy.set(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    secretCopy,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signatureCopy = new Uint8Array(signature.byteLength);
  signatureCopy.set(signature);
  return await crypto.subtle.verify('HMAC', key, signatureCopy, encoder.encode(message));
}

function cacheSigningSecretBytes(secret: string | undefined): Uint8Array | null {
  if (!secret || !CACHE_SIGNING_SECRET_PATTERN.test(secret)) return null;
  const encoded = secret.slice(3);
  const bytes = fromBase64Url(encoded);
  if (bytes?.byteLength !== 32 || toBase64Url(bytes) !== encoded) return null;
  return bytes;
}

export function createCacheSigningSecret(): string {
  return `s1.${toBase64Url(crypto.getRandomValues(new Uint8Array(32)))}`;
}

export function isValidCacheSigningSecret(secret: string | undefined): boolean {
  return cacheSigningSecretBytes(secret) !== null;
}

export function randomPublisherToken(byteLength = 24): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

export async function matchesBearerSecret(
  request: Request,
  expectedSecret: string | undefined
): Promise<boolean> {
  if (!expectedSecret) return false;
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
        if (done) break;
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
  if (!parsed.success) return response({ error: 'Invalid publisher request' }, 400);
  try {
    return response(await options.execute(parsed.data));
  } catch (error) {
    if (error instanceof InvalidPublisherRequestError) {
      return response({ error: error.message }, 400);
    }
    console.error('Asset publisher HTTP operation failed', error);
    return response({ error: 'Publisher operation failed' }, 500);
  }
}

export async function createCacheToken(
  factionId: string,
  assetType: 'faction_sheet',
  secret: string
): Promise<string> {
  const secretBytes = cacheSigningSecretBytes(secret);
  if (!secretBytes) throw new Error('Cache-token signing secret is invalid');
  const nonce = randomPublisherToken(16);
  const unsigned = `v1.${nonce}`;
  const signature = await hmacBytes(secretBytes, `${unsigned}|${factionId}|${assetType}`);
  return `${unsigned}.${toBase64Url(signature)}`;
}

export async function verifyCacheToken(
  token: string,
  factionId: string,
  assetType: 'faction_sheet',
  secret: string | undefined
): Promise<boolean> {
  const secretBytes = cacheSigningSecretBytes(secret);
  if (!secretBytes || !CACHE_TOKEN_PATTERN.test(token)) return false;
  const [version, nonce, encodedSignature, extra] = token.split('.');
  if (version !== 'v1' || !nonce || !encodedSignature || extra) return false;
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
  return await verifyHmacBytes(secretBytes, `v1.${nonce}|${factionId}|${assetType}`, signature);
}

export function publisherJson(body: unknown, status = 200): Response {
  return response(body, status);
}
