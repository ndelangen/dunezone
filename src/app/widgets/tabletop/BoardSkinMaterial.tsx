/* @jsxImportSource ./three-jsx */
import { useThree } from '@react-three/fiber/webgpu';
import { createContext, use, useEffect, useMemo } from 'react';
import type { Texture } from 'three';

import { useBoardSkin } from './boardSkinPreference';
import { createBoardSkinMaterial } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/** A skin that wins over the viewer's own choice, for stories and previews that show one look. */
export const BoardSkinOverride = createContext<BoardSkin | null>(null);

/** The skin the board paint draws with here. */
export function useActiveBoardSkin(): BoardSkin {
  const preferred = useBoardSkin();
  return use(BoardSkinOverride) ?? preferred;
}

/** The board paint's material in the active skin; skins are still, so the table keeps drawing only on demand. */
export function BoardSkinMaterial({
  map = null,
  vertexColors,
  polygonOffset = false,
}: {
  map?: Texture | null;
  vertexColors: boolean;
  polygonOffset?: boolean;
}) {
  const skin = useActiveBoardSkin();
  const invalidate = useThree((state) => state.invalidate);
  const material = useMemo(
    () => createBoardSkinMaterial(skin, { vertexColors, polygonOffset, map }),
    [skin, vertexColors, polygonOffset, map]
  );
  useEffect(() => {
    invalidate();
    return () => material.dispose();
  }, [material, invalidate]);
  return <primitive object={material} attach="material" />;
}
