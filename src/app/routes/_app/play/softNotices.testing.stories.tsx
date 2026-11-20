import { testingPreview } from '@sb/preview';
import { finishTransitions, waitForFrame } from '@sb/storyWaits';
import { expect, userEvent, within } from 'storybook/test';

import { gameMeta } from './game.stories.fixture';
import { setChatNotices } from './multiplayer/chatNotices';
import {
  askViewer,
  biddingReachesViewer,
  liveSnapshot,
  otherFactions,
  writeToViewer,
  changeTable,
  holdNotices,
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
  decorators: [...gameMeta.decorators, holdNotices],
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

/*
 * A page that joins while it is already the viewer's turn raises nothing: only what happens while it watches is news.
 * A payment after joining shows the notices are raised, so the missing turn toast is not just one that has yet to arrive.
 */
export const JoiningRaisesNothing = meta.story({
  beforeEach: noticeSetup(biddingReachesViewer),
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    let giver = '';
    changeTable((snapshot) => {
      giver = payViewer(snapshot);
    });
    const { log, glowing } = noticeLog(page);
    await waitForFrame(() => log.getByRole('button', { name: `${giver} paid you 3 spice` }));
    await expect(log.queryByRole('button', { name: /Your turn to bid/ })).toBeNull();
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

/* The viewer claims their side of a battle first; the opponent claiming the other side makes it ready, and that is their turn. */
export const OpponentCompletesBattle = meta.story({
  beforeEach: noticeSetup((snapshot) => {
    snapshot.battle = {
      id: 'notice-battle',
      anchor: [1.32, 0.18, -2.94],
      territory: 'Arrakeen',
      territoryId: 'arrakeen',
      stage: 'preparing',
      sides: [{ factionId: ownFaction(snapshot).id, ready: false, choice: null }, null],
      deadline: null,
    };
  }),
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    changeTable((snapshot) => {
      const sides = snapshot.battle!.sides;
      snapshot.battle = {
        ...snapshot.battle!,
        sides: [sides[0], { factionId: otherSeat(snapshot).faction.id, ready: false, choice: null }],
      };
    });
    const { log } = noticeLog(page);
    const toast = await waitForFrame(() => log.getByRole('button', { name: 'Your battle in Arrakeen is up' }));
    await expect(finishTransitions(toast)).toBeVisible();
  },
});

/* A mention's toast opens the table chat, where the message is answered. */
export const MentionOpensTableChat = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const snapshot = liveSnapshot();
    const [asker] = otherFactions(snapshot);
    await writeToViewer(asker!.id, askViewer(snapshot));
    const { log } = noticeLog(page);
    await userEvent.click(
      await waitForFrame(() => log.getByRole('button', { name: new RegExp(`${asker!.name} mentioned you`) }))
    );
    await expect(await page.findByRole('textbox', { name: 'Message' })).toBeVisible();
  },
});

/* A table chat message that names another faction is not about the viewer, so it raises nothing; a payment after it shows notices still arrive. */
export const OtherMentionRaisesNothing = meta.story({
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const [asker, other] = otherFactions(liveSnapshot());
    await writeToViewer(asker!.id, `@${other!.name} your turn to pay up.`);
    let giver = '';
    changeTable((snapshot) => {
      giver = payViewer(snapshot);
    });
    const { log } = noticeLog(page);
    await waitForFrame(() => log.getByRole('button', { name: `${giver} paid you 3 spice` }));
    await expect(log.queryByRole('button', { name: /mentioned you/ })).toBeNull();
  },
});

/* With chat notifications turned off in the game menu, a private message raises nothing; a payment after it shows notices still arrive. */
export const ChatNotificationsOff = meta.story({
  beforeEach: () => {
    setChatNotices(false);
    return () => setChatNotices(true);
  },
  play: async ({ canvasElement }) => {
    const page = await tableShown(canvasElement);
    const [, writer] = otherFactions(liveSnapshot());
    await writeToViewer(writer!.id, 'Want to team up against the Emperor this turn?', writer!.id);
    let giver = '';
    changeTable((snapshot) => {
      giver = payViewer(snapshot);
    });
    const { log } = noticeLog(page);
    await waitForFrame(() => log.getByRole('button', { name: `${giver} paid you 3 spice` }));
    await expect(log.queryByRole('button', { name: /wrote to you/ })).toBeNull();
  },
});
