import preview from '@sb/preview';
import { expect, within } from 'storybook/test';

import { DREAMRULES_DECK } from '../../../widgets/treachery-tracker/tracker.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { playingSnapshot, productTransport } from './product.stories.fixture';

const meta = preview.meta({
  ...gameMeta,
  title: 'Play/Treachery tracker',
  /* The stories load the table chunk before they render, so its cold first load falls outside their first wait (#1302). */
  loaders: [
    async () => {
      await import('./multiplayer/HostedTable');
    },
  ],
});

/* The room answers seat 2's deck read, as it does for a faction whose rules keep the tracker; the deck is the Dreamrules deck. */
function trackerTransport() {
  return productTransport('seat-2', playingSnapshot('seat-2'), {
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
