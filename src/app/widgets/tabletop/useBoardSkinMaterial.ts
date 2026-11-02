import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { createContext, use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mesh } from 'three';
import type { BufferGeometry, Camera, Material, Scene, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { leaseBake, warmMaterial } from './bakeBoardSkin';
import type { BakeLease } from './bakeBoardSkin';
import { useBoardSkin, usePlanetShading } from './boardSkinPreference';
import { createBoardPaintMaterial } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/** A look that wins over the viewer's own choice, for stories and previews that show one look. */
export const BoardSkinOverride = createContext<{
  skin: BoardSkin;
  planet: boolean;
} | null>(null);

/** The skin and planet shading the board paint draws with here. */
function useActiveBoardLook(): { skin: BoardSkin; planet: boolean } {
  const skin = useBoardSkin();
  const planet = usePlanetShading();
  return use(BoardSkinOverride) ?? { skin, planet };
}

/** The material on the board now, and its hold on the bake it reads. */
type Shown = Readonly<{ material: Material; lease: BakeLease | null }>;

type PaintOptions = Readonly<{
  geometry: BufferGeometry;
  bakeGeometry: BufferGeometry;
  board: Board | null;
  map: Texture | null;
  vertexColors: boolean;
  polygonOffset: boolean;
}>;

type Table = Readonly<{
  renderer: WebGPURenderer;
  scene: Scene;
  camera: Camera;
}>;

/** Leases the bake a look reads, or none for the plain paint. */
const leaseFor = (renderer: WebGPURenderer, skin: BoardSkin, paint: PaintOptions): BakeLease | null =>
  skin === 'none'
    ? null
    : leaseBake(renderer, { skin, geometry: paint.bakeGeometry, board: paint.board, map: paint.map });

/** The paint material over a bake (or none), compiled for the table off the frame. */
async function warmPaint(table: Table, paint: PaintOptions, baked: Texture | null, planet: boolean): Promise<Material> {
  const { geometry, map, vertexColors, polygonOffset } = paint;
  const material = createBoardPaintMaterial({ vertexColors, polygonOffset, map, baked, planet });
  const mesh = new Mesh(geometry, material);
  /* The board meshes receive shadows, and three keys its compiled variants on that. */
  mesh.receiveShadow = true;
  await warmMaterial(table.renderer, mesh, table).catch(() => {
    /* Compiling ahead is only a head start; the first draw compiles whatever is left. */
  });
  return material;
}

/** Bakes the look and compiles its material off the frame; null when a newer look took over first. */
export async function prepareLook(
  table: Table,
  look: Readonly<{ skin: BoardSkin; planet: boolean }>,
  paint: PaintOptions,
  signal: AbortSignal
): Promise<Shown | null> {
  const lease = leaseFor(table.renderer, look.skin, paint);
  /* Letting go at once stops a bake nobody else holds, rather than finishing it for a look already replaced. */
  const letGo = () => lease?.release();
  signal.addEventListener('abort', letGo, { once: true });
  try {
    const baked = lease ? (await lease.baked).texture : null;
    signal.throwIfAborted();
    const material = await warmPaint(table, paint, baked, look.planet);
    if (signal.aborted) {
      material.dispose();
      return null;
    }
    /* From here the caller owns the look, and frees it should its own abort land before it is shown. */
    return { material, lease };
  } catch (error) {
    letGo();
    throw error;
  } finally {
    signal.removeEventListener('abort', letGo);
  }
}

/** Frees a look's material and lets go of its bake (shared bakes stay while held). */
const drop = (look: Shown) => {
  look.material.dispose();
  look.lease?.release();
};

/** Holds the look on the board: a newer one replaces it and frees it, and the last one is freed on unmount. */
function useShownLook(initial: () => Shown, invalidate: () => void) {
  const [shown, setShown] = useState<Shown>(initial);
  /* The look on the board, for the unmount to release. */
  const current = useRef(shown);

  /* Once a new look is on the board, the old material goes and lets go of its bake (shared bakes stay while held). */
  useLayoutEffect(() => {
    const previous = current.current;
    current.current = shown;
    if (previous !== shown) {
      drop(previous);
    }
    invalidate();
  }, [shown, invalidate]);

  useEffect(() => () => drop(current.current), []);

  return [shown, setShown] as const;
}

type BoardSkinMaterialProps = Readonly<{
  /** The mesh's own geometry. */
  geometry: BufferGeometry;
  /** The geometry the skin is baked over: the mesh's own, or a larger one covering it, so meshes can share one bake. */
  bakeGeometry?: BufferGeometry;
  /** The board definition the patterns follow; the legacy map has none, so its patterns ignore borders. */
  board?: Board | null;
  map?: Texture | null;
  vertexColors: boolean;
  polygonOffset?: boolean;
}>;

/**
 * The board paint's material in the active look.
 * The skin is baked once, so every frame reads one texture;
 * a new look is baked and compiled off the frame, and the board keeps its current look, bake and all, until the new one is ready, so choosing a skin never stalls the table.
 * Meshes take it as their `material` prop: swapping an attached child material can restore a stale one.
 */
export function useBoardSkinMaterial({
  geometry,
  bakeGeometry = geometry,
  board = null,
  map = null,
  vertexColors,
  polygonOffset = false,
}: BoardSkinMaterialProps) {
  const { skin, planet } = useActiveBoardLook();
  const renderer = useThree((state) => state.renderer) as unknown as WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [shown, setShown] = useShownLook(
    () => ({
      material: createBoardPaintMaterial({
        vertexColors,
        polygonOffset,
        map,
        baked: null,
        planet,
      }),
      lease: null,
    }),
    invalidate
  );

  useEffect(() => {
    const controller = new AbortController();
    const paint = {
      geometry,
      bakeGeometry,
      board,
      map,
      vertexColors,
      polygonOffset,
    };
    prepareLook({ renderer, scene, camera }, { skin, planet }, paint, controller.signal).then(
      (next) => next && (controller.signal.aborted ? drop(next) : setShown(next)),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          /* The board keeps its current look; say why the new one never came. */
          console.error('The board skin could not be prepared', error);
        }
      }
    );
    return () => controller.abort();
  }, [
    renderer,
    scene,
    camera,
    geometry,
    bakeGeometry,
    board,
    map,
    skin,
    planet,
    vertexColors,
    polygonOffset,
    setShown,
  ]);

  return shown.material;
}
