import { useThree } from '@react-three/fiber/webgpu';
import type { Vector3Tuple } from '@shared/play/model';
import { useLayoutEffect } from 'react';

import { CameraControls, CameraRelativeFog } from './CameraControls';
import type { CameraViewCommand } from './playView';

/* Marks the canvas once the seated camera has replaced the preview camera, which loads in its own chunk, so a check of the table's framing can wait for it (#1987). */
function PlayCameraMark() {
  const get = useThree((state) => state.get);
  useLayoutEffect(() => {
    const canvas = get().renderer.domElement;
    canvas.dataset.playCamera = 'ready';
    return () => {
      delete canvas.dataset.playCamera;
    };
  }, [get]);
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
