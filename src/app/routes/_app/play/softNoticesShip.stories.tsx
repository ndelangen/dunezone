import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import type { Decorator } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import { ShipToastStyleContext } from './multiplayer/SoftNotices';
import type { ShipToastStyle } from './multiplayer/SoftNotices';
import {
  changeTable,
  holdNotices,
  movementReachesViewer,
  noticeLog,
  noticeSetup,
  tableShown,
} from './softNotices.stories.fixture';

/*
 * PROTOTYPE (#2981 follow-up): what clicking "Your turn to ship and move" does, while the owner picks one.
 * Each story hands the viewer their turn; move the camera somewhere else first (pan, zoom or pick another view), then click the toast to try it.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Soft notifications/Ship toast options',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: noticeSetup(),
  globals: { motion: 'on' },
});

const styled =
  (style: ShipToastStyle): Decorator =>
  (Story) => (
    <ShipToastStyleContext value={style}>
      <Story />
    </ShipToastStyleContext>
  );

async function viewerToShip(canvasElement: HTMLElement) {
  const page = await tableShown(canvasElement);
  changeTable(movementReachesViewer);
  const { log } = noticeLog(page);
  const toast = await waitForFrame(() => log.getByRole('button', { name: /Your turn to ship and move/ }));
  await expect(finishTransitions(toast)).toBeVisible();
}

/* 1. As today: clicking only closes the toast. */
export const JustCloses = meta.story({
  decorators: [styled('close')],
  play: ({ canvasElement }) => viewerToShip(canvasElement),
});

/* 2. Clicking returns the camera to the Map view, the whole board. */
export const MapView = meta.story({
  decorators: [styled('map')],
  play: ({ canvasElement }) => viewerToShip(canvasElement),
});

/* 3. Clicking has the camera glide to the viewer's reserves behind their seat, where a shipment starts. */
export const YourReserves = meta.story({
  decorators: [styled('reserves')],
  play: ({ canvasElement }) => viewerToShip(canvasElement),
});
