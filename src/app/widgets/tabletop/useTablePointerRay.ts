import { useThree } from '@react-three/fiber/webgpu';
import type { PointerRay } from '@shared/play/tableGeometry';
import { useCallback, useMemo } from 'react';
import { Raycaster, Vector2 } from 'three';

/** The ray from the camera through a point of the page, for what a held piece is let go over. */
export function useTablePointerRay() {
  const { camera, renderer } = useThree();
  const normalizedPointer = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  return useCallback(
    (clientX: number, clientY: number): PointerRay => {
      const bounds = renderer.domElement.getBoundingClientRect();
      normalizedPointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(normalizedPointer, camera);
      const { origin, direction } = raycaster.ray;
      return { origin: origin.toArray(), direction: direction.toArray() };
    },
    [camera, normalizedPointer, raycaster, renderer.domElement]
  );
}
