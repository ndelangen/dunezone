/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'dunezone-table-lighting';

async function loadModule() {
  vi.resetModules();
  return import('./tableLighting');
}

describe('table lighting', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('starts at the table lighting when nothing is stored or the stored value is garbage', async () => {
    localStorage.setItem(KEY, 'bright');
    const { useTableLighting } = await loadModule();
    expect(renderHook(() => useTableLighting()).result.current).toBe(1);
  });

  it('clamps a stored value to the slider bounds', async () => {
    localStorage.setItem(KEY, '9');
    const { useTableLighting, TABLE_LIGHTING_MAX } = await loadModule();
    expect(renderHook(() => useTableLighting()).result.current).toBe(TABLE_LIGHTING_MAX);
  });

  it('stores and announces a new choice, clamped', async () => {
    const { useTableLighting, setTableLighting, TABLE_LIGHTING_MIN } = await loadModule();
    const { result } = renderHook(() => useTableLighting());
    act(() => setTableLighting(0.1));
    expect(result.current).toBe(TABLE_LIGHTING_MIN);
    expect(localStorage.getItem(KEY)).toBe(String(TABLE_LIGHTING_MIN));
  });

  it('keeps the choice for the page view when storage refuses writes', async () => {
    const { useTableLighting, setTableLighting } = await loadModule();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useTableLighting());
    act(() => setTableLighting(0.7));
    expect(result.current).toBe(0.7);
  });

  it('follows a change made in another tab', async () => {
    const { useTableLighting } = await loadModule();
    const { result } = renderHook(() => useTableLighting());
    localStorage.setItem(KEY, '1.2');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    });
    expect(result.current).toBe(1.2);
  });
});
