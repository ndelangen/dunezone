export type RetryTimer = {
  set: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clear: (handle: ReturnType<typeof setTimeout> | undefined) => void;
};

const browserTimer: RetryTimer = {
  set: (callback, delayMs) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle),
};

/**
 * Loads one published image, retrying a failed load in place until it succeeds or the caller disposes it.
 * The first retry waits `firstDelayMs` and each later one doubles, up to `maxDelayMs`.
 * Returns the disposer: it stops retrying, releases the loaded value, and releases one that arrives afterwards.
 */
export function loadPublishedFace<T>({
  load,
  onLoad,
  release,
  firstDelayMs = 5000,
  maxDelayMs = 60_000,
  timer = browserTimer,
}: {
  load: (onLoad: (value: T) => void, onError: () => void) => void;
  onLoad: (value: T) => void;
  release: (value: T) => void;
  firstDelayMs?: number;
  maxDelayMs?: number;
  timer?: RetryTimer;
}): () => void {
  let active = true;
  let loaded: T | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let retryDelay = firstDelayMs;
  const attempt = () =>
    load(
      (value) => {
        if (!active) {
          release(value);
          return;
        }
        loaded = value;
        onLoad(value);
      },
      () => {
        if (active) {
          retry = timer.set(attempt, retryDelay);
          retryDelay = Math.min(retryDelay * 2, maxDelayMs);
        }
      }
    );
  attempt();
  return () => {
    active = false;
    timer.clear(retry);
    if (loaded !== undefined) {
      release(loaded);
    }
  };
}
