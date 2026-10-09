import { useThree } from '@react-three/fiber/webgpu';
import { useLayoutEffect } from 'react';

/* The preview holds the original map camera without loading Play's orbit and keyboard controls. */
export function MapPreviewCamera() {
  const camera = useThree((state) => state.camera);
  useLayoutEffect(() => {
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }, [camera]);
  return null;
}
