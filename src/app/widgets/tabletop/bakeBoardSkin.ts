import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { BufferGeometry, Texture } from 'three';
import { Color, LinearFilter, Mesh, OrthographicCamera, RenderTarget, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { createBoardBakeMaterial } from './boardSkins';
import type { BoardBakeOptions, BoardSkin } from './boardSkins';

/*
 * A skin's patterns cost dozens of noise octaves per pixel, far too many to run on every frame of the table.
 * They never change for a board, so the GPU draws them once into a texture the board paint then reads with one lookup.
 */
const SIZE = 2048;

export type BakedSkin = Readonly<{ texture: Texture; dispose: () => void }>;

/**
 * Bakes one skin over one board geometry, seen straight down with the board's far side (-z) at the top.
 * The texture is read at u = x / (2 × board radius) + 0.5 and v = 0.5 − z / (2 × board radius).
 */
export function bakeBoardSkin(
  renderer: WebGPURenderer,
  geometry: BufferGeometry,
  skin: Exclude<BoardSkin, 'none'>,
  options: BoardBakeOptions
): BakedSkin {
  const material = createBoardBakeMaterial(skin, options);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);
  const camera = new OrthographicCamera(-BOARD_RADIUS, BOARD_RADIUS, BOARD_RADIUS, -BOARD_RADIUS, -10, 10);
  camera.position.set(0, 5, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const target = new RenderTarget(SIZE, SIZE, { depthBuffer: false });
  target.texture.magFilter = LinearFilter;
  target.texture.minFilter = LinearFilter;
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new Color());
  const previousAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);
    /* Mid-grey is "no change" under the shading and a flat normal, for any pixel no triangle reached. */
    renderer.setClearColor(new Color(0.5, 0.5, 0.5), 1);
    renderer.clear();
    renderer.render(scene, camera);
  } finally {
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    material.dispose();
  }
  return { texture: target.texture, dispose: () => target.dispose() };
}
