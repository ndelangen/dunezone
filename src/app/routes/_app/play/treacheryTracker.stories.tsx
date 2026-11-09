import preview from '@sb/preview';
import { STANDARD_PHASES } from '@shared/play/phases';
import type { GameSnapshot } from '@shared/play/protocol';
import { item, piece } from '@shared/play/setupSupply';
import { expect, within } from 'storybook/test';

import { gameMeta, install } from './game.stories.fixture';
import { DREAMRULES_DECK } from './panels/treacheryTracker/tracker.stories.fixture';
import { openTab } from './playing.stories.fixture';
import { cardBack, playingSnapshot, productTransport } from './product.stories.fixture';

const BIDDING_PHASE = STANDARD_PHASES.findIndex((entry) => entry.id === 'bidding');

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

/* The room answers seat 1's deck read, the House Atreides seat's, as it does for a faction whose rules keep the tracker; the deck is the Dreamrules deck. */
function trackerTransport(change?: (snapshot: GameSnapshot) => void) {
  const snapshot = playingSnapshot('seat-1');
  change?.(snapshot);
  return productTransport('seat-1', snapshot, {
    treacheryDeck: DREAMRULES_DECK.map(({ key, name, detail, face, count }) => ({ key, name, detail, face, count })),
  });
}

/* The Bidding phase, with Atreides holding open the face-down card of this name that is up for bid. */
function peekingAt(name: string) {
  return (snapshot: GameSnapshot) => {
    const card = DREAMRULES_DECK.find((entry) => entry.name === name)!;
    const bid = piece('bid-card', name, 'shared', '#000000', 'card', 'card');
    bid.items = [item('bid-card-item', name, card.face, cardBack(), 'card-treachery', false, 'Treachery')];
    snapshot.phase = BIDDING_PHASE;
    snapshot.table.pieces = [...snapshot.table.pieces, bid];
    snapshot.peek = { piece: bid };
  };
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

/*
 * In the Bidding phase Atreides peeks at the card up for bid, and the tracker puts that card up for bid by itself.
 * Everything else stays the player's own work; "Not up for bid" dismisses a card peeked at for another reason.
 */
export const APeekPutsTheCardUpForBid = meta.story({
  parameters: { chromatic: { disableSnapshot: true } },
  beforeEach: install(() => trackerTransport(peekingAt('Lasgun'))),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await openTab(page, 'Treachery tracker');
    const onBid = await page.findByRole('region', { name: 'On bid' }, { timeout: 30_000 });
    await expect(within(onBid).findByRole('button', { name: 'House Atreides won Lasgun' })).resolves.toBeVisible();
  },
});
