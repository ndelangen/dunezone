import preview from '@sb/preview';
import { rosterSeat } from '@shared/play/schema';
import { expect, within } from 'storybook/test';

import { DREAMRULES_DECK } from '../../../widgets/treachery-tracker/tracker.stories.fixture';
import { gameMeta, install } from './game.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { capturedFactions, playingSnapshot, productTransport } from './product.stories.fixture';

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

/* Seat 2's faction keeps the tracker by its rules; the game's Treachery deck is the Dreamrules deck. */
function trackerTransport() {
  const snapshot = playingSnapshot('seat-2');
  const own = rosterSeat(snapshot.roster, 'seat-2')!.faction!.id;
  const factions = capturedFactions();
  const sheet = factions[own]!;
  return productTransport('seat-2', snapshot, {
    factions: { ...factions, [own]: { ...sheet, rules: { ...sheet.rules, treacheryTracker: true } } },
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
