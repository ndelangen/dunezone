import type { z } from 'zod';

const encoder = new TextEncoder();
/**
 * The largest publisher request body that will be read.
 * `handleAuthenticatedJson` applies it twice, to the declared `Content-Length` and again to the bytes that actually arrive, because the header is optional and a sender is free to understate it.
 */
export const MAX_PUBLISHER_JSON_BODY_BYTES = 16 * 1024;

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

/** The publisher's JSON response, `no-store` like every other one here, for the routes that answer outside `handleAuthenticatedJson`. */
export function publicationJson(body: unknown, status = 200): Response {
  return response(body, status);
}
