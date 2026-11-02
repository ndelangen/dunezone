import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { createContext, use, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mesh } from 'three';
import type { BufferGeometry, Material, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { leaseBake, warmMaterial } from './bakeBoardSkin';
import type { BakeLease } from './bakeBoardSkin';
import { useBoardSkin, usePlanetShading } from './boardSkinPreference';
import { createBoardPaintMaterial } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/** A look that wins over the viewer's own choice, for stories and previews that show one look. */
export const BoardSkinOverride = createContext<{ skin: BoardSkin; planet: boolean } | null>(null);

/** The skin and planet shading the board paint draws with here. */
function useActiveBoardLook(): { skin: BoardSkin; planet: boolean } {
  const skin = useBoardSkin();
  const planet = usePlanetShading();
  return use(BoardSkinOverride) ?? { skin, planet };
}

/** The material on the board now, and its hold on the bake it reads. */
type Shown = Readonly<{ material: Material; lease: BakeLease | null }>;

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
}: {
  /** The mesh's own geometry. */
  geometry: BufferGeometry;
  /** The geometry the skin is baked over: the mesh's own, or a larger one covering it, so meshes can share one bake. */
  bakeGeometry?: BufferGeometry;
  /** The board definition the patterns follow; the legacy map has none, so its patterns ignore borders. */
  board?: Board | null;
  map?: Texture | null;
  vertexColors: boolean;
  polygonOffset?: boolean;
}) {
  const { skin, planet } = useActiveBoardLook();
  const renderer = useThree((state) => state.renderer) as unknown as WebGPURenderer;
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const [shown, setShown] = useState<Shown>(() => ({
    material: createBoardPaintMaterial({ vertexColors, polygonOffset, map, baked: null, planet }),
    lease: null,
  }));
  /* The look on the board, for the unmount to release. */
  const current = useRef(shown);

  useEffect(() => {
    const controller = new AbortController();
    const lease = skin === 'none' ? null : leaseBake(renderer, { skin, geometry: bakeGeometry, board, map });
    void (async () => {
      const baked = lease ? await lease.baked : null;
      const material = createBoardPaintMaterial({
        vertexColors,
        polygonOffset,
        map,
        baked: baked?.texture ?? null,
        planet,
      });
      const mesh = new Mesh(geometry, material);
      /* The board meshes receive shadows, and three keys its compiled variants on that. */
      mesh.receiveShadow = true;
      await warmMaterial(renderer, mesh, { scene, camera }).catch(() => {
        /* Compiling ahead is only a head start; the first draw compiles whatever is left. */
      });
      if (controller.signal.aborted) {
        material.dispose();
        lease?.release();
        return;
      }
      setShown({ material, lease });
    })().catch((error: unknown) => {
      lease?.release();
      if (!controller.signal.aborted) {
        /* The board keeps its current look; say why the new one never came. */
        console.error('The board skin could not be prepared', error);
      }
    });
    return () => controller.abort();
  }, [renderer, scene, camera, geometry, bakeGeometry, board, map, skin, planet, vertexColors, polygonOffset]);

  /* Once a new look is on the board, the old material goes and lets go of its bake (shared bakes stay while held). */
  useLayoutEffect(() => {
    const previous = current.current;
    current.current = shown;
    if (previous !== shown) {
      previous.material.dispose();
      previous.lease?.release();
    }
    invalidate();
  }, [shown, invalidate]);

  useEffect(
    () => () => {
      current.current.material.dispose();
      current.current.lease?.release();
    },
    []
  );

  return shown.material;
}
