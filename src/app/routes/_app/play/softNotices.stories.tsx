import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import {
  biddingReachesViewer,
  changeTable,
  holdGlowLit,
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
