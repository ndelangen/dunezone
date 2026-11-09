/**
 * How a page retries a published image that failed to load: after 5 s, doubling to a minute.
 * The hand's images and the table's faces share it, and the hosted verification reads it to know how long a recovery may take.
 */
export const PUBLISHED_RETRY_FIRST_MS = 5000;
export const PUBLISHED_RETRY_CEILING_MS = 60_000;

/** How long the retry after `attempt` earlier retries waits. */
export function publishedImageRetryDelayMs(attempt: number) {
  return Math.min(PUBLISHED_RETRY_FIRST_MS * 2 ** attempt, PUBLISHED_RETRY_CEILING_MS);
}
