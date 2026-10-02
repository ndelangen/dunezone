import { useEffect, useState } from 'react';

/** How long a page waits on its first Convex answer before it says the server cannot be reached. */
export const SERVER_WAIT_MS = 10_000;
/* One wording for every Play page, split for a page that shows a heading over a line. */
export const SERVER_UNREACHABLE_TITLE = "Can't reach the server";
export const SERVER_RETRYING = 'Retrying...';
export const SERVER_UNREACHABLE = `${SERVER_UNREACHABLE_TITLE}. ${SERVER_RETRYING}`;

/**
 * Whether `waiting` has held for a whole `SERVER_WAIT_MS`.
 * Convex keeps retrying on its own while a query has no answer, so a page only changes what it says and keeps its way out.
 */
export function useServerUnreachable(waiting: boolean) {
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setTimeout(() => setStalled(true), SERVER_WAIT_MS);
    return () => {
      clearTimeout(timer);
      setStalled(false);
    };
  }, [waiting]);
  return waiting && stalled;
}
