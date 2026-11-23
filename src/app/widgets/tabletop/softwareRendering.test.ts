// @vitest-environment jsdom

import { afterEach, expect, test, vi } from 'vite-plus/test';

import { rendersInSoftware, resetSoftwareRendering } from './softwareRendering';

const UNMASKED_RENDERER_WEBGL = 0x92_46;
const RENDERER = 0x1f_01;

function stubRenderer(name: string | null, { unmasked = true } = {}) {
  const loseContext = vi.fn();
  const getContext = vi.fn(((kind: string) =>
    kind === 'webgl2' && name !== null
      ? {
          RENDERER,
          getExtension: (extension: string) =>
            extension === 'WEBGL_lose_context'
              ? { loseContext }
              : unmasked && extension === 'WEBGL_debug_renderer_info'
                ? { UNMASKED_RENDERER_WEBGL }
                : null,
          getParameter: (parameter: number) =>
            parameter === (unmasked ? UNMASKED_RENDERER_WEBGL : RENDERER) ? name : 'WebKit WebGL',
        }
      : null) as HTMLCanvasElement['getContext']);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(getContext);
  return { getContext, loseContext };
}

afterEach(() => {
  resetSoftwareRendering();
  vi.restoreAllMocks();
});

test.each([
  'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)',
  'llvmpipe (LLVM 15.0.7, 256 bits)',
  'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)',
])('%s renders in software', (name) => {
  const { loseContext } = stubRenderer(name);
  expect(rendersInSoftware()).toBe(true);
  expect(loseContext).toHaveBeenCalledOnce();
});

test('a hardware GPU does not, and the answer holds for the page', () => {
  const { getContext } = stubRenderer('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)');
  expect(rendersInSoftware()).toBe(false);
  expect(rendersInSoftware()).toBe(false);
  expect(getContext).toHaveBeenCalledOnce();
});

test('without the unmasked name the plain renderer string decides', () => {
  stubRenderer('llvmpipe', { unmasked: false });
  expect(rendersInSoftware()).toBe(true);
});

test('a browser without WebGL2 does not count as software', () => {
  stubRenderer(null);
  expect(rendersInSoftware()).toBe(false);
});
