import { startArtworkLoad } from './artworkLoads';

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
 * The first attempt's outcome settles the load for the browser verification, so a retry never holds it up.
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
  const settle = startArtworkLoad();
  const attempt = () =>
    load(
      (value) => {
        if (!active) {
          release(value);
          return;
        }
        loaded = value;
        onLoad(value);
        settle();
      },
      () => {
        settle();
        if (active) {
          retry = timer.set(attempt, retryDelay);
          retryDelay = Math.min(retryDelay * 2, maxDelayMs);
        }
      }
    );
  attempt();
  return () => {
    active = false;
    settle();
    timer.clear(retry);
    if (loaded !== undefined) {
      release(loaded);
    }
  };
}

/**
 * One load per key, shared by every subscriber while any holds it.
 * A table draws the same published image on many pieces and on every layer of a stack, and each separate load would be a separate GPU texture with its own upload and mipmaps.
 * The first subscriber starts `loadPublishedFace`, later ones receive the value it already holds, and the last unsubscribe releases it.
 * `peek` returns a key's loaded value, so a face that mounts while its image is held draws it in its first frame instead of a placeholder.
 * The last unsubscribe releases the value only after `releaseDelayMs`, so a face that hands its image to another in the same commit (a flip swaps the top and underside images) keeps it instead of reloading it behind a placeholder.
 */
export function sharedPublishedFaces<T>({
  releaseDelayMs = 1000,
  ...options
}: Omit<Parameters<typeof loadPublishedFace<T>>[0], 'load' | 'onLoad'> & {
  load: (key: string, onLoad: (value: T) => void, onError: () => void) => void;
  prepare?: (value: T) => void;
  releaseDelayMs?: number;
}) {
  type Entry = {
    value?: T;
    listeners: Set<(value: T) => void>;
    stop: () => void;
    releasing?: ReturnType<typeof setTimeout>;
  };
  const timer = options.timer ?? browserTimer;
  const entries = new Map<string, Entry>();
  const subscribe = (key: string, listener: (value: T) => void) => {
    let entry = entries.get(key);
    if (entry?.releasing !== undefined) {
      timer.clear(entry.releasing);
      entry.releasing = undefined;
    }
    if (!entry) {
      const created: Entry = {
        listeners: new Set(),
        stop: () => {},
      };
      entries.set(key, created);
      created.stop = loadPublishedFace<T>({
        ...options,
        load: (onLoad, onError) => options.load(key, onLoad, onError),
        onLoad: (value) => {
          options.prepare?.(value);
          created.value = value;
          for (const notify of created.listeners) {
            notify(value);
          }
        },
      });
      entry = created;
    } else if (entry.value !== undefined) {
      listener(entry.value);
    }
    const held = entry;
    held.listeners.add(listener);
    return () => {
      held.listeners.delete(listener);
      if (held.listeners.size === 0 && entries.get(key) === held && held.releasing === undefined) {
        held.releasing = timer.set(() => {
          held.releasing = undefined;
          if (held.listeners.size === 0 && entries.get(key) === held) {
            entries.delete(key);
            held.stop();
          }
        }, releaseDelayMs);
      }
    };
  };
  return Object.assign(subscribe, { peek: (key: string): T | undefined => entries.get(key)?.value });
}
