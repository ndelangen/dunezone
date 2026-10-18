import { TABLE_PHASES } from '@shared/play/phases';
import { DEFAULT_TABLE_SEAT_COUNT } from '@shared/play/tableSettings';
import { trackerArcSlots } from '@shared/play/tableTrackers';
import { expect, waitFor } from 'storybook/test';
import { Vector3 } from 'three';

import { cameraPoseFor, tableCamera } from '../../../widgets/tabletop/playView';
import { tableOverlayRects } from '../../../widgets/tabletop/seatedHeader';
import { mapViewFramingPoints } from '../../../widgets/tabletop/tablePlateGeometry';

/*
 * The table's camera and settle helpers, kept apart from the product fixtures so a unit test can load them alone.
 * `playing.stories.fixture` re-exports them for the stories.
 */

export const SETTLE = { timeout: 30_000 } as const;

/** Waits for the visible panel, which arrives with the connection. */
export const settled = (assert: () => void | Promise<void>) => waitFor(assert, SETTLE);

/* The seated camera loads in its own chunk and the preview camera frames the table until it arrives, which on a busy runner takes many seconds (#1987). */
export async function waitForPlayCamera(document: Document) {
  await waitFor(
    () => expect(document.querySelector('.dune-play-shell canvas[data-play-camera="ready"]')).not.toBeNull(),
    {
      timeout: 60_000,
    }
  );
}

/** Where a point on the table lands in the viewport while the table shows the map view. */
export function mapViewPoint(document: Document, point: readonly [number, number, number]): [number, number] {
  const scene = document.querySelector('canvas');
  if (!scene) {
    throw new TypeError('The table scene is missing.');
  }
  const sceneBounds = scene.getBoundingClientRect();
  const aspectRatio = sceneBounds.width / sceneBounds.height;
  const pose = cameraPoseFor(
    'map',
    aspectRatio,
    mapViewFramingPoints(trackerArcSlots(TABLE_PHASES.length), DEFAULT_TABLE_SEAT_COUNT),
    0,
    tableOverlayRects(scene)
  );
  const projected = new Vector3(...point).project(tableCamera(pose, aspectRatio));
  return [
    sceneBounds.left + ((projected.x + 1) * sceneBounds.width) / 2,
    sceneBounds.top + ((1 - projected.y) * sceneBounds.height) / 2,
  ];
}
