import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import {
  biddingReachesViewer,
  changeTable,
  noticeLog,
  noticeSetup,
  otherSeat,
  ownFaction,
  payViewer,
  tableShown,
} from './softNotices.stories.fixture';

/* What raises a soft notification for the viewer (#2981), and what clicking one opens. */
const meta = testingPreview.meta({
  ...gameMeta,
  title: 'Play/Soft notifications',
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
  beforeEach: noticeSetup(),
});

/* Another faction pays the viewer: a toast names who and how much, and nothing glows, since it is not their turn. */
export const PaidByAnotherFaction = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    let giver = '';
    changeTable((snapshot) => {
      giver = payViewer(snapshot);
    });
    const { log, glowing } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: `${giver} paid you 3 spice` }));
    await expect(finishTransitions(toast)).toBeVisible();
    await expect(glowing()).toBe(false);
  },
});

/* Spice paid during setup toasts as well, though setup has no turns to announce. */
export const PaidDuringSetup = meta.story({
  beforeEach: noticeSetup((snapshot) => {
    snapshot.stage = 'setup';
  }),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await page.findByRole('log', { name: 'Notifications' }, { timeout: 30_000 });
    let giver = '';
    changeTable((snapshot) => {
      giver = payViewer(snapshot);
    });
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: `${giver} paid you 3 spice` }));
    await expect(finishTransitions(toast)).toBeVisible();
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

/* The viewer's turn passing to another faction takes its toast with it, so a stale "Your turn" never lingers. */
export const PassedTurnLeaves = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    changeTable(biddingReachesViewer);
    const { log } = noticeLog(page);
    await waitForFrame(() => log.getByRole('button', { name: /Your turn to bid/ }));
    changeTable((snapshot) => {
      snapshot.bidding = { ...snapshot.bidding!, turn: otherSeat(snapshot).faction.id };
    });
    await waitForFrame(() => expect(log.queryByRole('button', { name: /Your turn to bid/ })).toBeNull());
  },
});
