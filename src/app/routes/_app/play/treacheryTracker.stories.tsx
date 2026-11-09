import preview from '@sb/preview';
import { rosterFactionIds } from '@shared/play/protocol';
import { expect, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { DREAMRULES_DECK } from './panels/treacheryTracker/tracker.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Treachery tracker',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
      /* Each story starts from a fresh tracker, not the one the story before it filled in. */
      const { forgetTrackers } = await import('./panels/treacheryTracker/trackerStore');
      forgetTrackers();
    },
  ],
});

/* The room answers seat 2's deck read, as it does for a faction whose rules keep the tracker; the deck is the Dreamrules deck. */
function trackerTransport(handCounts?: Record<string, number>) {
  const snapshot = playingSnapshot('seat-2');
  if (handCounts) {
    snapshot.handCounts = handCounts;
  }
  return productTransport('seat-2', snapshot, {
    treacheryDeck: DREAMRULES_DECK.map(({ key, name, detail, face, count }) => ({ key, name, detail, face, count })),
  });
}

/** A faction whose rules allow it opens the Treachery tracker under Yours: a fresh copy of the game's deck, and the seated factions in seat order. */
export const AtTheTable = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(trackerTransport),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Treachery tracker');
    await expect(page.findByText(/^Deck \d+/, undefined, { timeout: 30_000 })).resolves.toBeVisible();
  },
});

/** The tracker fills itself in from the table: each faction's public hand count becomes that many unknown cards in its row. */
export const FillsInFromTheTable = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() =>
    trackerTransport(
      Object.fromEntries(
        rosterFactionIds(playingSnapshot('seat-2').roster).map((id, index) => [id, index === 1 ? 2 : 1])
      )
    )
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Treachery tracker');
    const hands = await page.findByRole('region', { name: 'Hands' }, { timeout: 30_000 });
    await expect(within(hands).findAllByRole('button', { name: 'Unknown card' })).resolves.toHaveLength(
      rosterFactionIds(playingSnapshot('seat-2').roster).length + 1
    );
  },
});
