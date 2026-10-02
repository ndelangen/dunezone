import { useEffect, useState } from 'react';

/** How long a page waits on its first Convex answer before it says the server cannot be reached. */
export const SERVER_WAIT_MS = 10_000;
export const SERVER_UNREACHABLE = "Can't reach the server. Retrying...";

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
