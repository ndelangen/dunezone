/* @jsxImportSource ./three-jsx */
import { useThree } from '@react-three/fiber/webgpu';
import type { Board } from '@shared/boards/schema';
import { createContext, use, useEffect, useMemo } from 'react';
import type { Texture } from 'three';

import { boardEdgeField } from './boardEdgeField';
import { useBoardSkin, usePlanetShading } from './boardSkinPreference';
import { createBoardSkinMaterial } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/** A look that wins over the viewer's own choice, for stories and previews that show one look. */
export const BoardSkinOverride = createContext<{ skin: BoardSkin; planet: boolean } | null>(null);

/** The skin and planet shading the board paint draws with here. */
function useActiveBoardLook(): { skin: BoardSkin; planet: boolean } {
  const skin = useBoardSkin();
  const planet = usePlanetShading();
  return use(BoardSkinOverride) ?? { skin, planet };
}

/** The board paint's material in the active look; looks are still, so the table keeps drawing only on demand. */
export function BoardSkinMaterial({
  board = null,
  map = null,
  vertexColors,
  polygonOffset = false,
}: {
  /** The board definition the patterns follow; the legacy map has none, so its patterns ignore borders. */
  board?: Board | null;
  map?: Texture | null;
  vertexColors: boolean;
  polygonOffset?: boolean;
}) {
  const { skin, planet } = useActiveBoardLook();
  const invalidate = useThree((state) => state.invalidate);
  const edges = useMemo(() => (board && skin !== 'none' ? boardEdgeField(board) : null), [board, skin]);
  const material = useMemo(
    () => createBoardSkinMaterial(skin, { vertexColors, polygonOffset, map, edges, planet }),
    [skin, vertexColors, polygonOffset, map, edges, planet]
  );
  useEffect(() => {
    invalidate();
    return () => material.dispose();
  }, [material, invalidate]);
  return <primitive object={material} attach="material" />;
}
