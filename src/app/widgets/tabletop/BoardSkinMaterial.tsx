/* @jsxImportSource ./three-jsx */
import { useFrame, useThree } from '@react-three/fiber/webgpu';
import { createContext, use, useEffect, useMemo } from 'react';
import type { Texture } from 'three';

import { useMotionAllowed } from '@app/styles/motion';

import { useBoardSkin } from './boardSkinPreference';
import { boardSkinAnimates, createBoardSkinMaterial } from './boardSkins';
import type { BoardSkin } from './boardSkins';

/** A skin that wins over the viewer's own choice, for stories and previews that show one look. */
export const BoardSkinOverride = createContext<BoardSkin | null>(null);

/** The skin the board paint draws with here. */
export function useActiveBoardSkin(): BoardSkin {
  const preferred = useBoardSkin();
  return use(BoardSkinOverride) ?? preferred;
}

/** The board paint's material in the active skin; an animated skin keeps the table redrawing only while motion is allowed. */
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
  const motion = useMotionAllowed();
  const invalidate = useThree((state) => state.invalidate);
  const { material, advance } = useMemo(
    () => createBoardSkinMaterial(skin, { vertexColors, polygonOffset, map }),
    [skin, vertexColors, polygonOffset, map]
  );
  useEffect(() => {
    invalidate();
    return () => material.dispose();
  }, [material, invalidate]);
  const animated = motion && boardSkinAnimates(skin);
  useFrame((_, delta) => {
    if (animated) {
      advance(delta);
      invalidate();
    }
  });
  return <primitive object={material} attach="material" />;
}
