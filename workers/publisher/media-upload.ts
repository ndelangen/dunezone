/**
 * What the two media write paths share (#1888): `PUT /__media/src` for originals and `PUT /m` for variants.
 * Both take a bearer secret, read a bounded body and record a SHA-256 the Worker computes itself.
 */
import type { Refusal } from './media-response';

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

function digest(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
}

/** Compares digests rather than the secrets themselves, so the comparison takes the same time whatever the lengths. */
async function bearerMatches(request: Request, expected: string): Promise<boolean> {
  const presented = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!presented) {
    return false;
  }
  const [left, right] = await Promise.all([digest(presented), digest(expected)]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

/** Refuses with 503 while the secret is unset and 401 for any other bearer, or returns null to go on. */
export async function authorizeBearer(
  request: Request,
  expected: string | undefined,
  purpose: string
): Promise<Refusal | null> {
  if (!expected) {
    return { status: 503, message: `${purpose} is not configured` };
  }
  return (await bearerMatches(request, expected)) ? null : { status: 401, message: 'Not authorized' };
}

function concatenate(chunks: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Reads at most `limit` bytes and returns null past it, whatever Content-Length claimed. */
export async function readBounded(request: Request, limit: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get('Content-Length') ?? '0') > limit) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return new Uint8Array();
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    total += next.value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  return concatenate(chunks);
}
