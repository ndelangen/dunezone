import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import {
  askViewer,
  biddingReachesViewer,
  liveSnapshot,
  movementReachesViewer,
  otherFactions,
  ownPiecesSpot,
  pingFromOtherSeat,
  writeToViewer,
  changeTable,
  holdGlowLit,
  holdNotices,
  noticeLog,
  noticeSetup,
  tableShown,
} from './softNotices.stories.fixture';

/*
 * Soft notifications over the table (#2981): a toast under the phase header when something happens to the viewer,
 * and a soft glow round the screen's edge when it is their turn.
 * What raises a notice, and what clicking one opens, is in softNotices.testing.stories.tsx.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Soft notifications',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  decorators: [...gameMeta.decorators, holdNotices],
  beforeEach: noticeSetup(),
});

/* The bidder comes to the viewer's faction: a toast says it is their turn, and the screen's edge glows, held here at its height. */
export const YourTurnGlows = meta.story({
  globals: { motion: 'on' },
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    changeTable(biddingReachesViewer);
    const { log, glow } = noticeLog(page);
    const lit = await waitForFrame(() => {
      const element = glow();
      if (!element) {
        throw new Error('The edge is not glowing yet.');
      }
      return element;
    });
    holdGlowLit(lit);
    await expect(getComputedStyle(lit).opacity).toBe('1');
    const toast = await waitForFrame(() => log.getByRole('button', { name: /Your turn to bid/ }));
    await expect(finishTransitions(toast)).toBeVisible();
  },
});

/* Another faction names the viewer's faction in the table chat: a toast says who, with their words quieter under it. */
export const MentionedInTableChat = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const snapshot = liveSnapshot();
    const [asker] = otherFactions(snapshot);
    await writeToViewer(asker!.id, askViewer(snapshot));
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() =>
      log.getByRole('button', { name: new RegExp(`${asker!.name} mentioned you`) })
    );
    await expect(finishTransitions(toast)).toBeVisible();
  },
});

/* Another faction writes to the viewer in their private chat: a toast says who, with the message under it. */
export const PrivateMessage = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const [, writer] = otherFactions(liveSnapshot());
    await writeToViewer(writer!.id, 'Want to team up against the Emperor this turn?', writer!.id);
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() =>
      log.getByRole('button', { name: new RegExp(`${writer!.name} wrote to you`) })
    );
    await expect(finishTransitions(toast)).toBeVisible();
  },
});

/* Another player pings the viewer's own pieces: a toast names who, and the territory; clicking it has the camera glide there. */
export const PingOnYourPieces = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const pinger = pingFromOtherSeat(ownPiecesSpot(liveSnapshot()));
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() =>
      log.getByRole('button', { name: new RegExp(`${pinger} pinged your pieces`) })
    );
    await expect(finishTransitions(toast)).toBeVisible();
  },
});

/* Shipment and Movement reaches the viewer: a toast says it is their turn; clicking it has the camera glide to their faction token. */
export const YourTurnToShip = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    changeTable(movementReachesViewer);
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: /Your turn to ship and move/ }));
    await expect(finishTransitions(toast)).toBeVisible();
  },
});
