import { BufferGeometry } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { expect, test } from 'vite-plus/test';

import { leaseBake } from './bakeBoardSkin';

const renderer = {} as WebGPURenderer;

test('meshes asking for the same bake share it until the last lets go', () => {
  const geometry = new BufferGeometry();
  const source = { skin: 'fancy', geometry, board: null, map: null } as const;
  const first = leaseBake(renderer, source);
  const second = leaseBake(renderer, source);
  const other = leaseBake(renderer, { ...source, skin: 'gf9' });
  /* No frames run here, so every bake stops early; only who shares what matters. */
  for (const lease of [first, second, other]) {
    lease.baked.catch(() => {});
  }
  expect(second.baked).toBe(first.baked);
  expect(other.baked).not.toBe(first.baked);
  first.release();
  first.release();
  const third = leaseBake(renderer, source);
  third.baked.catch(() => {});
  expect(third.baked).toBe(first.baked);
  second.release();
  third.release();
  const fresh = leaseBake(renderer, source);
  fresh.baked.catch(() => {});
  expect(fresh.baked).not.toBe(first.baked);
  fresh.release();
  other.release();
});
