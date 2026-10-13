import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useLayoutEffect, useMemo } from 'react';

import { cameraPoseFor } from './playView';

/* The preview shares Play's map target without loading its orbit and keyboard controls. */
export function MapPreviewCamera({ mapFramingPoints }: { mapFramingPoints?: readonly Vector3Tuple[] }) {
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);
  const target = useMemo(() => cameraPoseFor('map', 1, mapFramingPoints).target, [mapFramingPoints]);
  useLayoutEffect(() => {
    camera.lookAt(...target);
    camera.updateMatrixWorld();
    invalidate();
  }, [camera, invalidate, target]);
  return null;
}
