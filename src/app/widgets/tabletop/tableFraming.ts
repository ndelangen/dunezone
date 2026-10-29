import type { GameSnapshot } from '@shared/play/protocol';
import type { TableSeatCount } from '@shared/play/tableSettings';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { useMemo } from 'react';

import { boardFurnitureFor } from './boardFurniture';
import { cameraPoseFor, TABLE_CAMERA_FAR, TABLE_CAMERA_FIELD_OF_VIEW, TABLE_CAMERA_NEAR } from './playView';
import { mapViewFramingPoints } from './tablePlateGeometry';
import type { TableProgress } from './tableTrackers';

/* The trackers the stage shows, and the map view and opening camera that frame the boards with them. */
export function useTableFraming(
  stage: GameSnapshot['stage'],
  providedProgress: TableProgress | undefined,
  seatCount: TableSeatCount,
  troopKinds?: number,
  extraBoards = 0
) {
  const { trackers } = boardFurnitureFor(stage);
  const tableProgress = trackers === 'none' ? undefined : providedProgress;
  const phaseCount = tableProgress?.phases.length ?? null;
  const trackerSlots = useMemo(() => {
    const slots = phaseCount === null ? [] : trackerArcSlots(phaseCount);
    return trackers === 'spice' ? slots.filter((slot) => slot.kind === 'spice') : slots;
  }, [phaseCount, trackers]);
  const mapFramingPoints = useMemo(
    () => mapViewFramingPoints(trackerSlots, seatCount, troopKinds, extraBoards),
    [extraBoards, seatCount, trackerSlots, troopKinds]
  );
  /* A close look may slide over to the extra boards too. */
  const zoomReach = extraBoards;
  const camera = useMemo(
    () => ({
      position: cameraPoseFor('map', 1, mapFramingPoints).position,
      fov: TABLE_CAMERA_FIELD_OF_VIEW,
      near: TABLE_CAMERA_NEAR,
      far: TABLE_CAMERA_FAR,
    }),
    [mapFramingPoints]
  );
  return { tableProgress, trackerSlots, mapFramingPoints, zoomReach, camera };
}
