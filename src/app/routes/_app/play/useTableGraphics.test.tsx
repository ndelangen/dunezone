// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { resetTableGraphics, useTableGraphics } from './useTableGraphics';

function stubWebGL2(available: boolean) {
  const loseContext = vi.fn();
  const context = { getExtension: () => ({ loseContext }) };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
    kind === 'webgl2' && available ? context : null) as HTMLCanvasElement['getContext']);
  return loseContext;
}

function stubWebGPU(adapter: Promise<unknown> | undefined) {
  vi.stubGlobal('navigator', { ...navigator, gpu: adapter && { requestAdapter: () => adapter } });
}

afterEach(() => {
  resetTableGraphics();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('WebGL2 is enough to draw, and its probe context is released at once', () => {
  const loseContext = stubWebGL2(true);
  stubWebGPU(undefined);
  const { result } = renderHook(() => useTableGraphics());
  expect(result.current).toBe('ready');
  expect(loseContext).toHaveBeenCalledOnce();
});

test('without WebGL2 a WebGPU adapter still draws', async () => {
  stubWebGL2(false);
  stubWebGPU(Promise.resolve({}));
  const { result } = renderHook(() => useTableGraphics());
  expect(result.current).toBe('checking');
  await waitFor(() => expect(result.current).toBe('ready'));
});

test('with neither WebGL2 nor a WebGPU adapter the table cannot be drawn', async () => {
  stubWebGL2(false);
  stubWebGPU(Promise.resolve(null));
  const { result } = renderHook(() => useTableGraphics());
  await waitFor(() => expect(result.current).toBe('unavailable'));
});

test('a browser without WebGPU at all, or whose adapter request fails, cannot draw without WebGL2', async () => {
  stubWebGL2(false);
  stubWebGPU(undefined);
  const missing = renderHook(() => useTableGraphics());
  await waitFor(() => expect(missing.result.current).toBe('unavailable'));
  resetTableGraphics();
  stubWebGPU(Promise.reject(new Error('adapter refused')));
  const refused = renderHook(() => useTableGraphics());
  await waitFor(() => expect(refused.result.current).toBe('unavailable'));
});
