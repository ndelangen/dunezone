/* @vitest-environment jsdom */
/* @jsxImportSource ./three-jsx */
import { _roots, createRoot, extend, useFrame, useThree } from '@react-three/fiber/webgpu';
import { act } from '@testing-library/react';
import { useEffect } from 'react';
import { EventDispatcher, Group } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { afterEach, expect, test, vi } from 'vite-plus/test';

/* These exercise the patched Fiber root and reconciler; only GPU driver calls are replaced. */
extend({ Group });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function rendererFor(canvas: HTMLCanvasElement, init = async () => {}) {
  return {
    domElement: canvas,
    backend: {},
    xr: new EventDispatcher(),
    init,
    render: vi.fn(),
    setPixelRatio: vi.fn(),
    getPixelRatio: () => 1,
    setSize: vi.fn(),
    dispose: vi.fn(),
  };
}

function InvalidateOnUnmount() {
  useFrame(() => {});
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => () => invalidate(), [invalidate]);
  return <group />;
}

test('a mounted canvas releases its root without invalidating a retired scheduler root', async () => {
  const warn = vi.spyOn(console, 'warn');
  const canvas = document.createElement('canvas');
  const renderer = rendererFor(canvas);
  const disconnect = vi.spyOn(renderer.xr, 'removeEventListener');
  const root = createRoot(canvas);
  await root.configure({
    renderer: () => renderer as unknown as WebGPURenderer,
    frameloop: 'never',
    size: { width: 10, height: 10, top: 0, left: 0 },
  });
  await act(async () => {
    root.render(<InvalidateOnUnmount />);
  });
  const state = _roots.get(canvas)!.store.getState();
  const invalidate = vi.spyOn(state.internal.scheduler!, 'invalidateRoot');
  state.invalidate();
  expect(invalidate).toHaveBeenCalledWith(state.internal.rootId, 1, false);
  vi.useFakeTimers();
  await act(async () => {
    root.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(disconnect).toHaveBeenCalledTimes(2);
  expect(Math.max(...disconnect.mock.invocationCallOrder)).toBeLessThan(renderer.dispose.mock.invocationCallOrder[0]);
});

test('a canvas removed while renderer initialization is pending finishes teardown after initialization', async () => {
  const warn = vi.spyOn(console, 'warn');
  let finish!: () => void;
  const initializing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const canvas = document.createElement('canvas');
  const renderer = rendererFor(canvas, () => initializing);
  const root = createRoot(canvas);
  const configured = root.configure({
    renderer: () => renderer as unknown as WebGPURenderer,
    frameloop: 'never',
    size: { width: 10, height: 10, top: 0, left: 0 },
  });
  await Promise.resolve();
  vi.useFakeTimers();
  await act(async () => {
    root.unmount();
  });
  await act(async () => {
    finish();
    await configured;
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  expect(renderer.dispose).toHaveBeenCalledOnce();
});

test('an initialization failure still removes its partial root and releases the renderer', async () => {
  const warn = vi.spyOn(console, 'warn');
  const canvas = document.createElement('canvas');
  const renderer = rendererFor(canvas, async () => {
    throw new Error('device refused');
  });
  const root = createRoot(canvas);
  await expect(root.configure({ renderer: () => renderer as unknown as WebGPURenderer })).rejects.toThrow(
    'device refused'
  );
  vi.useFakeTimers();
  await act(async () => {
    root.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(warn).not.toHaveBeenCalled();
  expect(renderer.dispose).toHaveBeenCalledOnce();
});

test('the same canvas remounts without retaining or waking the previous root', async () => {
  const warn = vi.spyOn(console, 'warn');
  const canvas = document.createElement('canvas');
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const renderer = rendererFor(canvas);
    const root = createRoot(canvas);
    await root.configure({ renderer: () => renderer as unknown as WebGPURenderer, frameloop: 'never' });
    await act(async () => {
      root.render(<InvalidateOnUnmount />);
    });
    const state = _roots.get(canvas)!.store.getState();
    vi.useFakeTimers();
    await act(async () => {
      root.unmount();
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(_roots.has(canvas)).toBe(false);
    state.invalidate();
    await act(async () => {
      root.render(<InvalidateOnUnmount />);
    });
    expect(_roots.has(canvas)).toBe(false);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  }
  expect(warn).not.toHaveBeenCalled();
});

test('a secondary canvas releases its root while the primary keeps the shared renderer', async () => {
  const warn = vi.spyOn(console, 'warn');
  const canvas = document.createElement('canvas');
  const renderer = rendererFor(canvas);
  const primary = createRoot(canvas);
  await primary.configure({
    id: 'lifecycle-primary',
    renderer: () => renderer as unknown as WebGPURenderer,
    frameloop: 'never',
  });
  const otherCanvas = document.createElement('canvas');
  const secondary = createRoot(otherCanvas);
  await secondary.configure({ primaryCanvas: 'lifecycle-primary', frameloop: 'never' });
  await act(async () => {
    primary.render(<InvalidateOnUnmount />);
    secondary.render(<InvalidateOnUnmount />);
  });
  vi.useFakeTimers();
  await act(async () => {
    secondary.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(otherCanvas)).toBe(false);
  expect(_roots.has(canvas)).toBe(true);
  expect(renderer.dispose).not.toHaveBeenCalled();
  await act(async () => {
    primary.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(warn).not.toHaveBeenCalled();
});

test('an immediate remount cancels deferred teardown and keeps the canvas renderer alive', async () => {
  const warn = vi.spyOn(console, 'warn');
  const canvas = document.createElement('canvas');
  const renderer = rendererFor(canvas);
  const first = createRoot(canvas);
  const configuration = { renderer: () => renderer as unknown as WebGPURenderer, frameloop: 'never' as const };
  await first.configure(configuration);
  await act(async () => {
    first.render(<group name="first" />);
  });
  vi.useFakeTimers();
  await act(async () => {
    first.unmount();
  });
  const replacement = createRoot(canvas);
  await replacement.configure(configuration);
  await act(async () => {
    replacement.render(<group name="replacement" />);
  });
  await act(async () => {
    first.render(<group name="stale" />);
    first.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  const state = _roots.get(canvas)?.store.getState();
  expect(state?.scene.getObjectByName('replacement')).toBeDefined();
  expect(state?.internal.active).toBe(true);
  expect(renderer.dispose).not.toHaveBeenCalled();
  await act(async () => {
    replacement.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(warn).not.toHaveBeenCalled();
});

test('an immediate remount shares pending initialization and retires the abandoned render', async () => {
  const warn = vi.spyOn(console, 'warn');
  let finish!: () => void;
  const initializing = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const canvas = document.createElement('canvas');
  const renderer = rendererFor(canvas, () => initializing);
  const makeRenderer = vi.fn(() => renderer as unknown as WebGPURenderer);
  const configuration = { renderer: makeRenderer, frameloop: 'never' as const };
  const first = createRoot(canvas);
  const firstConfigured = first.configure(configuration);
  first.render(<group name="abandoned" />);
  first.unmount();
  const replacement = createRoot(canvas);
  const replacementConfigured = replacement.configure(configuration);
  await act(async () => {
    finish();
    await Promise.all([firstConfigured, replacementConfigured]);
    replacement.render(<group name="replacement" />);
  });
  vi.useFakeTimers();
  await vi.advanceTimersByTimeAsync(500);
  const state = _roots.get(canvas)!.store.getState();
  expect(state.scene.getObjectByName('replacement')).toBeDefined();
  expect(state.scene.getObjectByName('abandoned')).toBeUndefined();
  expect(makeRenderer).toHaveBeenCalledOnce();
  expect(renderer.dispose).not.toHaveBeenCalled();
  await act(async () => {
    replacement.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(warn).not.toHaveBeenCalled();
});

test('a completed root handle cannot unmount a new root on the same canvas', async () => {
  const warn = vi.spyOn(console, 'warn');
  const canvas = document.createElement('canvas');
  const originalRenderer = rendererFor(canvas);
  const first = createRoot(canvas);
  await first.configure({ renderer: () => originalRenderer as unknown as WebGPURenderer, frameloop: 'never' });
  await act(async () => {
    first.render(<group name="first" />);
  });
  vi.useFakeTimers();
  await act(async () => {
    first.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  const renderer = rendererFor(canvas);
  const replacement = createRoot(canvas);
  await replacement.configure({ renderer: () => renderer as unknown as WebGPURenderer, frameloop: 'never' });
  await act(async () => {
    replacement.render(<group name="replacement" />);
  });
  await act(async () => {
    first.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.get(canvas)?.store.getState().scene.getObjectByName('replacement')).toBeDefined();
  expect(renderer.dispose).not.toHaveBeenCalled();
  await act(async () => {
    replacement.unmount();
  });
  await vi.advanceTimersByTimeAsync(500);
  expect(_roots.has(canvas)).toBe(false);
  expect(renderer.dispose).toHaveBeenCalledOnce();
  expect(originalRenderer.dispose).toHaveBeenCalledOnce();
  expect(warn).not.toHaveBeenCalled();
});

test.each(['successful', 'failed'] as const)(
  'a remount waits for %s asynchronous disposal before creating a fresh renderer',
  async (outcome) => {
    const warn = vi.spyOn(console, 'warn');
    const disposalError = new Error('backend disposal failed');
    let finish!: () => void;
    const disposing = new Promise<void>((resolve, reject) => {
      finish = () => (outcome === 'failed' ? reject(disposalError) : resolve());
    });
    if (outcome === 'failed') {
      warn.mockImplementation(() => {});
    }
    const canvas = document.createElement('canvas');
    const originalRenderer = rendererFor(canvas);
    originalRenderer.dispose.mockImplementation(() => disposing);
    const first = createRoot(canvas);
    await first.configure({ renderer: () => originalRenderer as unknown as WebGPURenderer, frameloop: 'never' });
    await act(async () => {
      first.render(<group name="first" />);
    });
    vi.useFakeTimers();
    await act(async () => {
      first.unmount();
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(originalRenderer.dispose).toHaveBeenCalledOnce();
    const renderer = rendererFor(canvas);
    const makeRenderer = vi.fn(() => renderer as unknown as WebGPURenderer);
    const replacement = createRoot(canvas);
    const configured = replacement.configure({ renderer: makeRenderer, frameloop: 'never' });
    expect(makeRenderer).not.toHaveBeenCalled();
    await act(async () => {
      finish();
      await configured;
      replacement.render(<group name="replacement" />);
    });
    const state = _roots.get(canvas)?.store.getState();
    expect(state?.scene.getObjectByName('replacement')).toBeDefined();
    expect(state?.renderer).toBe(renderer);
    expect(makeRenderer).toHaveBeenCalledOnce();
    expect(renderer.dispose).not.toHaveBeenCalled();
    await act(async () => {
      replacement.unmount();
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(_roots.has(canvas)).toBe(false);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(originalRenderer.dispose).toHaveBeenCalledOnce();
    if (outcome === 'failed') {
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        '[R3F] Error while unmounting root; teardown may be incomplete:',
        disposalError
      );
    } else {
      expect(warn).not.toHaveBeenCalled();
    }
  }
);
