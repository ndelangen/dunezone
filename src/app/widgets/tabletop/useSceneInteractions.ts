import { useCallback, useEffect, useState } from 'react';

import { useTabletopSelector } from './TabletopContext';

export function useSceneInteractions(onInteractionActiveChange: ((active: boolean) => void) | undefined) {
  const gestureActivePieceId = useTabletopSelector((table) => table.gestureActivePieceId);
  const [pointerActive, setPointerActive] = useState(false);
  const onPointerSessionChange = useCallback(
    (nextActive: boolean) => {
      setPointerActive(nextActive);
      if (nextActive) {
        onInteractionActiveChange?.(true);
      }
    },
    [onInteractionActiveChange]
  );
  const sceneInteractionActive = pointerActive || gestureActivePieceId !== null;

  useEffect(() => {
    onInteractionActiveChange?.(sceneInteractionActive);
  }, [onInteractionActiveChange, sceneInteractionActive]);
  useEffect(() => () => onInteractionActiveChange?.(false), [onInteractionActiveChange]);

  return {
    controlsEnabled: !gestureActivePieceId && !pointerActive,
    onPointerSessionChange,
  };
}
