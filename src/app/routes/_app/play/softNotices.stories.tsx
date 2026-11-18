import preview from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import {
  biddingReachesViewer,
  changeTable,
  noticeLog,
  noticeSetup,
  otherSeat,
  ownFaction,
  tableShown,
} from './softNotices.stories.fixture';

/*
 * Soft notifications over the table (#2981): a toast under the phase header when something happens to the viewer,
 * and a soft glow round the screen's edge when it is their turn.
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

/* The bidder comes to the viewer's faction: a toast says it is their turn, and the screen's edge glows. */
export const YourTurnGlows = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    changeTable(biddingReachesViewer);
    const { log, glowing } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: /Your turn to bid/ }));
    await expect(finishTransitions(toast)).toBeVisible();
    await expect(glowing()).toBe(true);
  },
});

/* Another faction pays the viewer: a toast names who and how much, and nothing glows, since it is not their turn. */
export const PaidByAnotherFaction = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    let giver = '';
    changeTable((snapshot) => {
      const other = otherSeat(snapshot);
      giver = other.faction.name;
      snapshot.spiceTransfers = [
        ...(snapshot.spiceTransfers ?? []),
        {
          revision: snapshot.revision,
          kind: 'payment',
          actor: other.player,
          amount: 3,
          source: 'table',
          destination: ownFaction(snapshot).id,
        },
      ];
    });
    const { log, glowing } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: `${giver} paid you 3 spice` }));
    await expect(finishTransitions(toast)).toBeVisible();
    await expect(glowing()).toBe(false);
  },
});

/* An alliance offer to the viewer toasts, and clicking it opens the Alliances panel, where the offer is answered. */
export const AllianceOfferOpensAlliances = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    let from = '';
    changeTable((snapshot) => {
      const other = otherSeat(snapshot);
      from = other.faction.name;
      snapshot.alliances = {
        groups: [],
        offers: [{ from: other.faction.id, to: ownFaction(snapshot).id, at: snapshot.revision, id: 0 }],
      };
    });
    const { log } = noticeLog(page);
    await userEvent.click(
      await waitForFrame(() => log.getByRole('button', { name: `${from} offers you an alliance` }))
    );
    await expect(await page.findByText('Offers you an alliance')).toBeVisible();
    await expect(log.queryByRole('button', { name: `${from} offers you an alliance` })).toBeNull();
  },
});

/* A page that joins while it is already the viewer's turn raises nothing: only what happens while it watches is news. */
export const JoiningRaisesNothing = meta.story({
  beforeEach: noticeSetup(biddingReachesViewer),
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const { log, glowing } = noticeLog(page);
    await expect(log.queryAllByRole('button')).toHaveLength(0);
    await expect(glowing()).toBe(false);
  },
});
