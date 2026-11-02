import type { Board } from '@shared/boards/schema';
import { BOARD_RADIUS } from '@shared/play/tableGeometry';
import type { BufferGeometry, Camera, Texture } from 'three';
import { Color, LinearFilter, Mesh, OrthographicCamera, RenderTarget, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { boardEdgeField } from './boardEdgeField';
import { createBoardBakeMaterial } from './boardSkins';
import type { BoardBakeOptions, BoardSkin } from './boardSkins';

/*
 * A skin's patterns cost dozens of noise octaves per pixel, far too many to run on every frame of the table.
 * They never change for a board, so the GPU draws them once into a texture the board paint then reads with one lookup.
 * Even once is too much for a single frame, so the bake compiles its shader off the frame and then draws in tiles,
 * one tile per frame, while the table keeps its old look.
 */
const SIZE = 2048;
const TILES = 8;

type BakedSkin = Readonly<{ texture: Texture; dispose: () => void }>;

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
async function bakeBoardSkin({
  renderer,
  geometry,
  skin,
  options,
  signal,
}: Readonly<{
  renderer: WebGPURenderer;
  geometry: BufferGeometry;
  skin: Exclude<BoardSkin, 'none'>;
  options: BoardBakeOptions;
  /** Aborts the bake between frames, when a newer look or an unmount has taken over. */
  signal: AbortSignal;
}>): Promise<BakedSkin> {
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
  mesh: Mesh,
  table: Readonly<{ scene: Scene; camera: Camera }>
): Promise<void> {
  await renderer.compileAsync(mesh, table.camera, table.scene);
}

/** What a bake is drawn from: two meshes asking for the same source share one bake. */
export type BakeSource = Readonly<{
  skin: Exclude<BoardSkin, 'none'>;
  geometry: BufferGeometry;
  board: Board | null;
  map: Texture | null;
}>;

/** A hold on a shared bake: the bake lives until its last holder lets go. */
export type BakeLease = Readonly<{ baked: Promise<BakedSkin>; release: () => void }>;

type SharedBake = {
  renderer: WebGPURenderer;
  source: BakeSource;
  baked: Promise<BakedSkin>;
  holders: number;
  stop: AbortController;
};

const sharedBakes: SharedBake[] = [];

const sameSource = (a: BakeSource, b: BakeSource) =>
  a.skin === b.skin && a.geometry === b.geometry && a.board === b.board && a.map === b.map;

/* Waits a frame first, so the CPU edge field (drawn once per board) stays apart from the click that chose the skin. */
async function bakeAfterAFrame(renderer: WebGPURenderer, source: BakeSource, signal: AbortSignal): Promise<BakedSkin> {
  await nextFrame(signal);
  const edges = source.board ? boardEdgeField(source.board) : null;
  return bakeBoardSkin({
    renderer,
    geometry: source.geometry,
    skin: source.skin,
    options: { map: source.map, edges },
    signal,
  });
}

/** Holds the bake for a source, starting it unless another holder already has; release it once no longer drawn. */
export function leaseBake(renderer: WebGPURenderer, source: BakeSource): BakeLease {
  let shared = sharedBakes.find((entry) => entry.renderer === renderer && sameSource(entry.source, source));
  if (!shared) {
    const stop = new AbortController();
    shared = { renderer, source, baked: bakeAfterAFrame(renderer, source, stop.signal), holders: 0, stop };
    sharedBakes.push(shared);
  }
  const held = shared;
  held.holders++;
  let released = false;
  return {
    baked: held.baked,
    release: () => {
      if (released) {
        return;
      }
      released = true;
      held.holders--;
      if (held.holders === 0) {
        sharedBakes.splice(sharedBakes.indexOf(held), 1);
        held.stop.abort();
        held.baked.then(
          (baked) => baked.dispose(),
          () => {
            /* Stopped before it finished; the bake freed its own target. */
          }
        );
      }
    },
  };
}
