import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useCallback, useMemo } from 'react';
import { Raycaster, Vector2 } from 'three';

/* About the height of a faction token's face as it rests on the table. */
const TOKEN_FACE_HEIGHT = 0.2;

/** Where the pointer meets the faces of the tokens resting on the table, for what a held piece is let go over. */
export function useTableSurfacePointFromClient() {
  const { camera, renderer } = useThree();
  const normalizedPointer = useMemo(() => new Vector2(), []);
  const raycaster = useMemo(() => new Raycaster(), []);
  return useCallback(
    (clientX: number, clientY: number): Vector3Tuple | null => {
      const bounds = renderer.domElement.getBoundingClientRect();
      normalizedPointer.set(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1
      );
      raycaster.setFromCamera(normalizedPointer, camera);
      const { origin, direction } = raycaster.ray;
      if (Math.abs(direction.y) < 1e-6) {
        return null;
      }
      const distance = (TOKEN_FACE_HEIGHT - origin.y) / direction.y;
      return distance > 0
        ? [origin.x + direction.x * distance, TOKEN_FACE_HEIGHT, origin.z + direction.z * distance]
        : null;
    },
    [camera, normalizedPointer, raycaster, renderer.domElement]
  );
}
