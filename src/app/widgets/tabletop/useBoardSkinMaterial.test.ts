import { BufferGeometry, Camera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { afterEach, expect, test, vi } from 'vite-plus/test';

import { prepareLook } from './useBoardSkinMaterial';

/* Just enough of a renderer for a bake to run through: every call succeeds, and draws are counted. */
const stubRenderer = () => {
  const render = vi.fn();
  const renderer = {
    autoClear: true,
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    getScissorTest: () => false,
    setScissorTest: () => {},
    getClearColor: (color: unknown) => color,
    getClearAlpha: () => 1,
    setClearColor: () => {},
    clear: () => {},
    compileAsync: () => Promise.resolve(),
    render,
  };
  return { renderer: renderer as unknown as WebGPURenderer, render };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

const nextFrame = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a look replaced while it bakes stops its bake at once', async () => {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 0));
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => clearTimeout(frame));
  const { renderer, render } = stubRenderer();
  const geometry = new BufferGeometry();
  const paint = { geometry, bakeGeometry: geometry, board: null, map: null, vertexColors: false, polygonOffset: false };
  const controller = new AbortController();
  const prepared = prepareLook(
    { renderer, scene: new Scene(), camera: new Camera() },
    { skin: 'gf9', planet: true },
    paint,
    controller.signal
  );
  controller.abort();
  await expect(prepared).rejects.toBeDefined();
  /* Give an unstopped bake the frames it would need to draw all its tiles. */
  for (let frame = 0; frame < 80; frame++) {
    await nextFrame();
  }
  expect(render).not.toHaveBeenCalled();
});
