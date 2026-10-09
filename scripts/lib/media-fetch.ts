/**
 * The HTTP client the media scripts share for `/m` and `/__media/src` (#1888).
 * One attempt is the request and its whole body, so a connection that drops mid-body is retried like one that never connected.
 * 429, 5xx and connection errors are transport and are retried with the given pauses.
 * Any other answer is returned for the caller to judge.
 */
import { TransientError, describeError, retryTransient } from '../retry-transient';

export type Fetched = { status: number; headers: Headers; bytes: Uint8Array<ArrayBuffer> };

/** The SHA-256 and byte length a served object must match. */
export type Integrity = { sha256: string; bytes: number };

export async function fetchMedia(
  url: string,
  init: RequestInit,
  { subject, delaysMs }: { subject: string; delaysMs: readonly number[] }
): Promise<Fetched> {
  return await retryTransient(
    async () => {
      try {
        const response = await fetch(url, init);
        if (response.status === 429 || response.status >= 500) {
          await response.body?.cancel();
          throw new TransientError(`HTTP ${response.status}`);
        }
        return {
          status: response.status,
          headers: response.headers,
          bytes: new Uint8Array(await response.arrayBuffer()),
        };
      } catch (error) {
        throw error instanceof TransientError ? error : new TransientError(describeError(error));
      }
    },
    { subject, delaysMs }
  );
}

/** True when the `X-Media-SHA256` and `X-Media-Bytes` headers name exactly this integrity. */
export function integrityMatches(headers: Headers, expected: Integrity): boolean {
  return headers.get('X-Media-SHA256') === expected.sha256 && headers.get('X-Media-Bytes') === String(expected.bytes);
}
