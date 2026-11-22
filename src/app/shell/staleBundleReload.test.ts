import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { RELOAD_GUARD_MS, RELOAD_KEY, installStaleBundleReload, reloadForStaleBundle } from './staleBundleReload';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

let reload: ReturnType<typeof vi.fn>;
let storage: Storage;

beforeEach(() => {
  reload = vi.fn();
  storage = memoryStorage();
  vi.stubGlobal('window', { location: { reload } });
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('sessionStorage', storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reloading for a stale bundle', () => {
  it('reloads a tab that has not reloaded for this yet, and remembers when', () => {
    expect(reloadForStaleBundle(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.getItem(RELOAD_KEY)).toBe('1000000');
  });

  it('refuses a second reload inside the guard window, so a chunk that stays missing cannot loop', () => {
    reloadForStaleBundle(1_000_000);
    expect(reloadForStaleBundle(1_000_000 + RELOAD_GUARD_MS - 1)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for a later deploy once the window has passed', () => {
    reloadForStaleBundle(1_000_000);
    expect(reloadForStaleBundle(1_000_000 + RELOAD_GUARD_MS)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload where the guard cannot be stored', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(reloadForStaleBundle()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload while offline, where the failure is the network rather than the deploy', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(reloadForStaleBundle()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads on Vite's chunk-load failure event without canceling it", () => {
    const target = new EventTarget();
    installStaleBundleReload(target);
    const event = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(event);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(false);
  });
});
