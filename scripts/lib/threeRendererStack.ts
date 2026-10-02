import { fileURLToPath } from 'node:url';

import type { Alias } from 'vite';

/**
 * drei's WebGPU entry imports the plain `@react-three/fiber` entry and one class from three's source tree, which three marks as having side effects.
 * Both kept a second fiber and a second copy of three's src-tree node classes next to the `@react-three/fiber/webgpu` and `three/webgpu` builds the table runs on.
 * As aliases they apply to the build, the dev server's dependency optimizer and Storybook alike, so every runtime loads one graph.
 */
export const threeRendererStackAliases: Alias[] = [
  /* A regular expression, so `@react-three/fiber/webgpu` itself is left alone. */
  { find: /^@react-three\/fiber$/u, replacement: '@react-three/fiber/webgpu' },
  {
    find: 'three/src/nodes/functions/PhysicalLightingModel.js',
    replacement: fileURLToPath(new URL('../../src/app/three/physicalLightingModel.ts', import.meta.url)),
  },
];
