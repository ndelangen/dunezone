import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { BufferGeometry, Camera, Material, Texture } from 'three';
import { Color, LinearFilter, Mesh, OrthographicCamera, RenderTarget, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { createBoardBakeMaterial } from './boardSkins';
import type { BoardBakeOptions, BoardSkin } from './boardSkins';

/*
 * A skin's patterns cost dozens of noise octaves per pixel, far too many to run on every frame of the table.
 * They never change for a board, so the GPU draws them once into a texture the board paint then reads with one lookup.
 * Even once is too much for a single frame, so the bake compiles its shader off the frame and then draws in tiles,
 * one tile per frame, while the table keeps its old look.
 */
const SIZE = 2048;
const TILES = 4;

export type BakedSkin = Readonly<{ texture: Texture; dispose: () => void }>;

/** Resolves on the next animation frame, or rejects once the bake is no longer wanted. */
function nextFrame(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const frame = requestAnimationFrame(() => {
      signal.removeEventListener('abort', stop);
      resolve();
    });
    const stop = () => {
      cancelAnimationFrame(frame);
      reject(signal.reason);
    };
    signal.addEventListener('abort', stop, { once: true });
  });
}

/** Draws into the target with it bound and the renderer's own clear and scissor settings put back afterwards. */
function drawInto(renderer: WebGPURenderer, target: RenderTarget, draw: () => void): void {
  const previousTarget = renderer.getRenderTarget();
  const previousAutoClear = renderer.autoClear;
  const previousScissorTest = renderer.getScissorTest();
  try {
    renderer.setRenderTarget(target);
    draw();
  } finally {
    renderer.setScissorTest(previousScissorTest);
    renderer.autoClear = previousAutoClear;
    renderer.setRenderTarget(previousTarget);
  }
}

/**
 * Bakes one skin over one board geometry, seen straight down with the board's far side (-z) at the top.
 * The texture is read at u = x / (2 × board radius) + 0.5 and v = 0.5 + z / (2 × board radius): three reads a render target top row first on every backend.
 */
export async function bakeBoardSkin(
  renderer: WebGPURenderer,
  geometry: BufferGeometry,
  skin: Exclude<BoardSkin, 'none'>,
  options: BoardBakeOptions,
  signal: AbortSignal
): Promise<BakedSkin> {
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
  try {
    /* compileAsync reads the bound target when called, then compiles off the frame. */
    let compiled: Promise<unknown> = Promise.resolve();
    drawInto(renderer, target, () => {
      compiled = renderer.compileAsync(scene, camera);
    });
    await compiled;
    await nextFrame(signal);
    drawInto(renderer, target, () => {
      /* Mid-grey is "no change" under the shading and a flat normal, for any pixel no triangle reached. */
      const previousColor = renderer.getClearColor(new Color());
      const previousAlpha = renderer.getClearAlpha();
      renderer.setClearColor(new Color(0.5, 0.5, 0.5), 1);
      renderer.clear();
      renderer.setClearColor(previousColor, previousAlpha);
    });
    const tile = SIZE / TILES;
    for (let index = 0; index < TILES * TILES; index++) {
      await nextFrame(signal);
      drawInto(renderer, target, () => {
        renderer.autoClear = false;
        renderer.setScissorTest(true);
        target.scissor.set((index % TILES) * tile, Math.floor(index / TILES) * tile, tile, tile);
        renderer.render(scene, camera);
      });
    }
  } catch (error) {
    target.dispose();
    throw error;
  } finally {
    material.dispose();
  }
  return { texture: target.texture, dispose: () => target.dispose() };
}

/** Compiles a material for the table's scene and camera off the frame, so its first draw does not stall the table. */
export async function warmMaterial(
  renderer: WebGPURenderer,
  geometry: BufferGeometry,
  material: Material,
  scene: Scene,
  camera: Camera
): Promise<void> {
  const mesh = new Mesh(geometry, material);
  await renderer.compileAsync(mesh, camera, scene);
}
