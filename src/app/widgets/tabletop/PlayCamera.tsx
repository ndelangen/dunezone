import type { Vector3Tuple } from '@shared/play/model';

import { CameraControls, CameraRelativeFog } from './CameraControls';
import type { CameraViewCommand } from './playView';

export function PlayCamera(props: {
  enabled: boolean;
  command: CameraViewCommand;
  mapFramingPoints: readonly Vector3Tuple[];
}) {
  return (
    <>
      <CameraRelativeFog />
      <CameraControls {...props} />
    </>
  );
}
