import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { createContext, use, useEffect, useState } from 'react';
import type { BufferGeometry, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { bakeBoardSkin, warmMaterial } from './bakeBoardSkin';
import type { BakedSkin } from './bakeBoardSkin';
import { boardEdgeField } from './boardEdgeField';
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

/** The active skin baked over this geometry, or null for the skin None; while a new skin bakes, the last one stays. */
function useBakedSkin(
  geometry: BufferGeometry,
  skin: BoardSkin,
  board: Board | null,
  map: Texture | null
): Texture | null {
  const renderer = useThree((state) => state.renderer) as unknown as WebGPURenderer;
  const [baked, setBaked] = useState<BakedSkin | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (skin === 'none') {
        /* Settled after the render that chose None, which already draws without the skin. */
        await Promise.resolve();
        if (!controller.signal.aborted) {
          setBaked(null);
        }
        return;
      }
      /* The edge field is drawn on the CPU once per board; a frame first keeps it apart from the click that chose the skin. */
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (controller.signal.aborted) {
        return;
      }
      const edges = board ? boardEdgeField(board) : null;
      const next = await bakeBoardSkin(renderer, geometry, skin, { map, edges }, controller.signal);
      if (controller.signal.aborted) {
        next.dispose();
        return;
      }
      setBaked(next);
    })().catch(() => {
      /* Abandoned for a newer look, or the renderer went away. */
    });
    return () => controller.abort();
  }, [renderer, geometry, skin, board, map]);
  useEffect(() => () => baked?.dispose(), [baked]);
  return skin === 'none' ? null : (baked?.texture ?? null);
}

/**
 * The board paint's material in the active look.
 * The skin is baked once, so every frame reads one texture;
 * a new look is baked and compiled off the frame, and the board keeps its current look until the new one is ready, so choosing a skin never stalls the table.
 * Meshes take it as their `material` prop: swapping an attached child material can restore a stale one.
 */
export function useBoardSkinMaterial({
  geometry,
  board = null,
  map = null,
  vertexColors,
  polygonOffset = false,
}: {
  /** The mesh's own geometry, which the skin is baked over. */
  geometry: BufferGeometry;
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
  const baked = useBakedSkin(geometry, skin, board, map);
  const [material, setMaterial] = useState(() =>
    createBoardPaintMaterial({ vertexColors, polygonOffset, map, baked: null, planet })
  );
  useEffect(() => {
    let current = true;
    const next = createBoardPaintMaterial({ vertexColors, polygonOffset, map, baked, planet });
    void warmMaterial(renderer, geometry, next, scene, camera)
      .catch(() => {
        /* Compiling ahead is only a head start; the first draw compiles whatever is left. */
      })
      .then(() => {
        if (current) {
          setMaterial(next);
        } else {
          next.dispose();
        }
      });
    return () => {
      current = false;
    };
  }, [renderer, geometry, scene, camera, vertexColors, polygonOffset, map, baked, planet]);
  useEffect(() => {
    invalidate();
    return () => material.dispose();
  }, [material, invalidate]);
  return material;
}
