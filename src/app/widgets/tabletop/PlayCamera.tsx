import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useLayoutEffect } from 'react';

import { CameraControls, CameraRelativeFog } from './CameraControls';
import type { CameraViewCommand } from './playView';

/* Marks the canvas once the seated camera has replaced the preview camera, which loads in its own chunk, so a check of the table's framing can wait for it (#1987). */
function PlayCameraMark() {
  const canvas = useThree((state) => state.renderer.domElement);
  useLayoutEffect(() => {
    canvas.dataset.playCamera = 'ready';
    return () => {
      delete canvas.dataset.playCamera;
    };
  }, [canvas]);
  return null;
}

export function PlayCamera(props: {
  enabled: boolean;
  command: CameraViewCommand;
  mapFramingPoints: readonly Vector3Tuple[];
}) {
  return (
    <>
      <PlayCameraMark />
      <CameraRelativeFog />
      <CameraControls {...props} />
    </>
  );
}
