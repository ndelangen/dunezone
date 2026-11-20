import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import type { Decorator } from '@storybook/tanstack-react';
import { expect } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import { PingNoticeStyleContext } from './multiplayer/SoftNotices';
import type { PingNoticeStyle } from './multiplayer/SoftNotices';
import {
  holdNotices,
  liveSnapshot,
  noticeLog,
  noticeSetup,
  ownPiecesSpot,
  pingFromOtherSeat,
  tableShown,
} from './softNotices.stories.fixture';

/*
 * PROTOTYPE (#2981 follow-up): options for which pings raise a notice, while the owner picks one.
 * Clicking a ping's toast has the camera glide to where it landed.
 */
const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Soft notifications/Ping options',
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
  (style: PingNoticeStyle): Decorator =>
  (Story) => (
    <PingNoticeStyleContext value={style}>
      <Story />
    </PingNoticeStyleContext>
  );

/* Another player pings the viewer's own pieces, and the toast it raises, if any, shows. */
async function pingOwnPieces(canvasElement: HTMLElement, expected: RegExp | null) {
  const page = await tableShown(canvasElement);
  const pinger = pingFromOtherSeat(ownPiecesSpot(liveSnapshot()));
  const { log } = noticeLog(page);
  if (!expected) {
    return;
  }
  const toast = await waitForFrame(() => log.getByRole('button', { name: new RegExp(`${pinger} ${expected.source}`) }));
  await expect(finishTransitions(toast)).toBeVisible();
}

/* 1. As today: no toast. The ripple, and the edge arrow while it is out of view, are all a ping shows. */
export const NoNotice = meta.story({
  decorators: [styled('off')],
  play: ({ canvasElement }) => pingOwnPieces(canvasElement, null),
});

/* 2. A ping on the viewer's own pieces toasts "Atreides pinged your pieces"; other pings do not. */
export const OnYourPieces = meta.story({
  decorators: [styled('pieces')],
  play: ({ canvasElement }) => pingOwnPieces(canvasElement, /pinged your pieces/),
});

/* 3. As 2, naming the territory: "Atreides pinged your pieces in Arrakeen". */
export const OnYourPiecesNamed = meta.story({
  decorators: [styled('place')],
  play: ({ canvasElement }) => pingOwnPieces(canvasElement, /pinged your pieces/),
});

/* 4. Every other player's ping toasts, wherever it lands: "Atreides pinged Carthag"; a player's newest ping replaces their last. */
export const EveryPing = meta.story({
  decorators: [styled('every')],
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const pinger = pingFromOtherSeat([0, 0.02, 0]);
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: new RegExp(`${pinger} pinged`) }));
    await expect(finishTransitions(toast)).toBeVisible();
  },
});
