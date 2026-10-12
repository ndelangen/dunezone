/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'dunezone-table-pan-speed';

async function loadModule() {
  vi.resetModules();
  return import('./tablePanSpeed');
}

describe('table pan speed', () => {
  beforeEach(() => localStorage.clear());

  it("starts at the table's own speed", async () => {
    const { useTablePanSpeed, readTablePanSpeed } = await loadModule();
    expect(renderHook(() => useTablePanSpeed()).result.current).toBe(1);
    expect(readTablePanSpeed()).toBe(1);
  });

  it('keeps a choice between a fifth and five times as fast', async () => {
    const { useTablePanSpeed, setTablePanSpeed, readTablePanSpeed } = await loadModule();
    const { result } = renderHook(() => useTablePanSpeed());
    act(() => setTablePanSpeed(9));
    expect(result.current).toBe(5);
    act(() => setTablePanSpeed(0.01));
    expect(readTablePanSpeed()).toBe(0.2);
    expect(localStorage.getItem(KEY)).toBe('0.2');
  });
});
