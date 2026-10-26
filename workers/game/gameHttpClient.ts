import { ConvexHttpClient } from 'convex/browser';

import { PLAY_REQUEST_TIMEOUT_MS } from '../../src/shared/play/admission';
import { DependencyFailure } from './diagnostics';
import type { ConvexCall } from './roomSummary';

/**
 * Convex did not answer: the request timed out or was aborted, the network failed, or the deployment answered with a redirect or a server error other than a function's own failure.
 * Retrying later may succeed, unlike a refusal or an answer this Worker cannot read.
 */
class ConvexUnavailable extends DependencyFailure {}

/* Convex reports a function that threw, a ConvexError included, with this status: that is an answer, not an outage. */
const FUNCTION_FAILED_STATUS = 560;
/* Request timeout and rate limiting: Convex is busy, not refusing. */
const BUSY_STATUSES = new Set([408, 429]);

/** Told of every request a room's client makes, by function path, so a room can account for its Convex use. */
export type ConvexObserver = (call: ConvexCall) => void;

/* The HTTP client posts `{ path, args, format }`; only the path is read, never the arguments. */
function functionPath(body: unknown) {
  try {
    const path: unknown = typeof body === 'string' ? (JSON.parse(body) as { path?: unknown }).path : undefined;
    return typeof path === 'string' ? path : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function gameHttpClient(url: string, observe?: ConvexObserver): ConvexHttpClient {
  return new ConvexHttpClient(url, {
    logger: false,
    fetch: async (input, init) => {
      const startedAt = Date.now();
      const signal = AbortSignal.timeout(PLAY_REQUEST_TIMEOUT_MS);
      const settle = (ok: boolean) =>
        observe?.({ path: functionPath(init?.body), durationMs: Math.max(0, Date.now() - startedAt), ok });
      try {
        const response = await fetch(input, {
          ...init,
          redirect: 'manual',
          signal,
        });
        if (
          (response.status >= 300 && response.status < 400) ||
          BUSY_STATUSES.has(response.status) ||
          (response.status >= 500 && response.status !== FUNCTION_FAILED_STATUS)
        ) {
          throw new ConvexUnavailable('Convex did not answer successfully.', {
            failureCategory: 'http',
            httpStatus: response.status,
            durationMs: Date.now() - startedAt,
          });
        }
        /* Read inside the timeout, so a body that stalls counts as Convex not answering. */
        const body = await response.arrayBuffer();
        /* A function failure (560) or a refused request reaches the caller as an error, so it counts as a failed call here too. */
        settle(response.ok);
        return new Response(body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      } catch (error) {
        settle(false);
        throw error instanceof ConvexUnavailable
          ? error
          : new ConvexUnavailable(
              'Convex did not answer.',
              {
                failureCategory: signal.aborted
                  ? 'timeout'
                  : error instanceof DOMException && error.name === 'AbortError'
                    ? 'aborted'
                    : 'network',
                durationMs: Date.now() - startedAt,
              },
              { cause: error }
            );
      }
    },
  });
}
