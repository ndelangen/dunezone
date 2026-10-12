/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { viewerPreference } from './viewerPreference';

const KEY = 'dunezone-test-preference';
const bounds = { min: 0.5, max: 2, fallback: 1 };

describe('viewer preference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('falls back when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(viewerPreference(KEY, bounds).read()).toBe(1);
  });

  it('stops following other tabs once nothing listens, and ignores other keys', () => {
    const preference = viewerPreference(KEY, bounds);
    const removed = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => preference.use());
    localStorage.setItem(KEY, '1.5');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
    });
    expect(result.current).toBe(1);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current).toBe(1.5);
    unmount();
    expect(removed).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
