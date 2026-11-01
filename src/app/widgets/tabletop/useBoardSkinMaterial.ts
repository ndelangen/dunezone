import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { createContext, use, useEffect, useMemo } from 'react';
import type { BufferGeometry, Texture } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import { bakeBoardSkin } from './bakeBoardSkin';
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

/** The active skin baked over this geometry once, or null for the skin None. */
function useBakedSkin(
  geometry: BufferGeometry,
  skin: BoardSkin,
  board: Board | null,
  map: Texture | null
): Texture | null {
  const renderer = useThree((state) => state.renderer) as unknown as WebGPURenderer;
  const baked = useMemo(
    () =>
      skin === 'none'
        ? null
        : bakeBoardSkin(renderer, geometry, skin, { map, edges: board ? boardEdgeField(board) : null }),
    [renderer, geometry, skin, board, map]
  );
  useEffect(() => () => baked?.dispose(), [baked]);
  return baked?.texture ?? null;
}

/**
 * The board paint's material in the active look;
 * the skin is baked once, so every frame reads one texture.
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
  const invalidate = useThree((state) => state.invalidate);
  const baked = useBakedSkin(geometry, skin, board, map);
  const material = useMemo(
    () => createBoardPaintMaterial({ vertexColors, polygonOffset, map, baked, planet }),
    [vertexColors, polygonOffset, map, baked, planet]
  );
  useEffect(() => {
    invalidate();
    return () => material.dispose();
  }, [material, invalidate]);
  return material;
}
